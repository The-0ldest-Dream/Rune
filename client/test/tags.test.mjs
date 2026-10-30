globalThis.__TAGDEBUG = true;
import test from 'node:test';
import assert from 'node:assert/strict';
import { readTags } from '../src/tags.js';

const enc = (s) => new TextEncoder().encode(s);
const cat = (...p) => { const out = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of p) { out.set(x, o); o += x.length; } return out; };
const be32 = (n) => Uint8Array.of(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255);
const le32 = (n) => Uint8Array.of(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24);
const ss32 = (n) => Uint8Array.of((n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127);
const PNG = cat(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), new Uint8Array(900).fill(7));
const file = (bytes, name = 'x.bin') => new File([bytes], name);

function id3(ver) {
  const frame = (id, body) => cat(enc(id), ver === 4 ? ss32(body.length) : be32(body.length), Uint8Array.of(0, 0), body);
  const text = (id, s, e = 3) => frame(id, cat(Uint8Array.of(e), e === 1 ? cat(Uint8Array.of(0xff, 0xfe), new Uint8Array([...s].flatMap((c) => [c.charCodeAt(0), 0]))) : enc(s)));
  const pic = frame('APIC', cat(Uint8Array.of(0), enc('image/png'), Uint8Array.of(0, 3), enc('cover'), Uint8Array.of(0), PNG));
  const body = cat(text('TIT2', 'The Scientist'), text('TPE1', ver === 4 ? 'Coldplay\0Coldplay' : 'Coldplay', ver === 4 ? 3 : 1), text('TALB', 'A Rush of Blood to the Head'), text('TRCK', '4/11'), pic);
  return cat(enc('ID3'), Uint8Array.of(ver, 0, 0), ss32(body.length), body);
}

test('ID3v2.3 (UTF-16) and v2.4 (UTF-8) with cover art', async () => {
  for (const v of [3, 4]) {
    const t = await readTags(file(cat(id3(v), new Uint8Array(100))));
    assert.equal(t.title, 'The Scientist'); assert.equal(t.artist, 'Coldplay'); assert.equal(t.trackNo, 4);
    assert.equal(t.album, 'A Rush of Blood to the Head'); assert.equal(t.art.type, 'image/png');
  }
});

test('FLAC vorbis comments + picture', async () => {
  const kv = (s) => cat(le32(enc(s).length), enc(s));
  const vc = cat(le32(3), enc('abc'), le32(3), kv('TITLE=Song'), kv('ARTIST=Band'), kv('ALBUM=Disc'));
  const picBody = cat(be32(3), be32(9), enc('image/png'), be32(0), be32(1), be32(1), be32(24), be32(0), be32(PNG.length), PNG);
  const blk = (last, type, b) => cat(Uint8Array.of((last ? 0x80 : 0) | type, (b.length >> 16) & 255, (b.length >> 8) & 255, b.length & 255), b);
  const t = await readTags(file(cat(enc('fLaC'), blk(0, 4, vc), blk(1, 6, picBody), new Uint8Array(50))));
  assert.deepEqual([t.title, t.artist, t.album, t.art.type], ['Song', 'Band', 'Disc', 'image/png']);
});

test('Ogg Opus comments spanning pages with embedded picture', async () => {
  const kv = (s) => cat(le32(enc(s).length), enc(s));
  const picBody = cat(be32(3), be32(9), enc('image/png'), be32(0), be32(1), be32(1), be32(24), be32(0), be32(PNG.length), PNG);
  const b64 = btoa(String.fromCharCode(...picBody));
  const tags = cat(enc('OpusTags'), le32(2), enc('xx'), le32(3), kv('TITLE=Opus Song'), kv('ARTIST=Opus Band'), kv('METADATA_BLOCK_PICTURE=' + b64));
  const page = (segs, bodyBytes, cont) => cat(enc('OggS'), Uint8Array.of(0, cont ? 1 : 0), new Uint8Array(20), Uint8Array.of(segs.length), Uint8Array.from(segs), bodyBytes);
  const head = enc('OpusHead' + '\x01\x02');
  const p1 = page([head.length], head, false);
  // split the tags packet across two pages: first page = 255-byte segments only (packet continues)
  const n255 = Math.floor(tags.length / 255) - 0;
  const firstLen = Math.max(1, Math.min(n255, 3)) * 255;
  const rest = tags.length - firstLen;
  const restSegs = []; let r = rest; while (r >= 255) { restSegs.push(255); r -= 255; } restSegs.push(r);
  const p2 = page(Array(firstLen / 255).fill(255), tags.subarray(0, firstLen), false);
  const p3 = page(restSegs, tags.subarray(firstLen), true);
  const t = await readTags(file(cat(p1, p2, p3)));
  assert.deepEqual([t.title, t.artist, t.art?.type], ['Opus Song', 'Opus Band', 'image/png']);
});

test('MP4 ilst tags and covr', async () => {
  const latin = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const box = (type, ...parts) => { const body = cat(...parts); return cat(be32(body.length + 8), latin(type), body); };
  const data = (flag, payload) => box('data', be32(flag), be32(0), payload);
  const item = (type, flag, payload) => box(type, data(flag, payload));
  const ilst = box('ilst', item('\u00a9nam', 1, enc('M4A Song')), item('\u00a9ART', 1, enc('M4A Band')), item('\u00a9alb', 1, enc('M4A Album')), item('trkn', 0, Uint8Array.of(0, 0, 0, 7, 0, 0, 0, 0)), item('covr', 14, PNG));
  const meta = box('meta', be32(0), ilst);
  const moov = box('moov', box('udta', meta));
  const ftyp = box('ftyp', enc('M4A '), be32(0));
  const t = await readTags(file(cat(ftyp, box('mdat', new Uint8Array(30)), moov)));
  assert.deepEqual([t.title, t.artist, t.album, t.trackNo, t.art?.type], ['M4A Song', 'M4A Band', 'M4A Album', 7, 'image/png']);
});

test('garbage input never throws', async () => {
  const t = await readTags(file(new Uint8Array(500).fill(9)));
  assert.equal(t.title, ''); assert.equal(t.art, null);
});

test('embedded lyrics: ID3 USLT, FLAC LYRICS and MP4 ©lyr', async () => {
  const frame = (id, body) => cat(enc(id), be32(body.length), Uint8Array.of(0, 0), body);
  const tag = (frames) => { const body = cat(...frames); return cat(enc('ID3'), Uint8Array.of(3, 0, 0), ss32(body.length), body); };
  const uslt = frame('USLT', cat(Uint8Array.of(3), enc('eng'), enc('desc'), Uint8Array.of(0), enc('[00:01.00]Hello\n[00:02.00]World')));
  let t = await readTags(file(cat(tag([frame('TIT2', cat(Uint8Array.of(3), enc('S'))), uslt]), new Uint8Array(50))));
  assert.equal(t.lyrics, '[00:01.00]Hello\n[00:02.00]World');
  const kv = (s) => cat(le32(enc(s).length), enc(s));
  const vc = cat(le32(1), enc('x'), le32(2), kv('TITLE=T'), kv('LYRICS=La la\r\nlaaa'));
  t = await readTags(file(cat(enc('fLaC'), Uint8Array.of(0x84, 0, 0, vc.length), vc)));
  assert.equal(t.lyrics, 'La la\nlaaa');
  const latin = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const box = (type, ...parts) => { const body = cat(...parts); return cat(be32(body.length + 8), latin(type), body); };
  const item = (type, payload) => box(type, box('data', be32(1), be32(0), payload));
  const moov = box('moov', box('udta', box('meta', be32(0), box('ilst', item('\u00a9lyr', enc('mp4 words'))))));
  t = await readTags(file(cat(box('ftyp', enc('M4A '), be32(0)), moov)));
  assert.equal(t.lyrics, 'mp4 words');
});
