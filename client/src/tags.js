// Dependency-free audio tag reader: title / artist / album / track number and embedded cover art.
// Supports ID3v2 (MP3 and others), FLAC, MP4/M4A and Ogg (Vorbis/Opus). Never throws – returns {} on failure.

const dec = (enc, bytes) => {
  try { return new TextDecoder(enc).decode(bytes); } catch { return ''; }
};
const u32be = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u32le = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const synchsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
const clean = (s) => s.replace(/\u0000+$/g, '').replace(/^\uFEFF/, '').trim();
const sniffImage = (b) =>
  b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x47 && b[1] === 0x49 ? 'image/gif' : b[0] === 0x52 && b[1] === 0x49 ? 'image/webp' : 'image/jpeg';

const toBlob = (bytes, mime) => (bytes && bytes.length > 16 ? new Blob([bytes], { type: mime && mime.startsWith('image/') ? mime : sniffImage(bytes) }) : null);

/* ---------------- ID3v2 ---------------- */
function textFrame(data) {
  const enc = data[0];
  const body = data.subarray(1);
  let text;
  if (enc === 1 || enc === 2) {
    const be = enc === 2 || (body[0] === 0xfe && body[1] === 0xff);
    const skip = (body[0] === 0xff && body[1] === 0xfe) || (body[0] === 0xfe && body[1] === 0xff) ? 2 : 0;
    text = dec(be ? 'utf-16be' : 'utf-16le', body.subarray(skip));
  } else text = dec(enc === 3 ? 'utf-8' : 'windows-1252', body);
  return text.split('\u0000').map((s) => s.trim()).filter(Boolean);
}

function decodeText(enc, body) {
  if (enc === 1 || enc === 2) {
    const be = enc === 2 || (body[0] === 0xfe && body[1] === 0xff);
    const skip = (body[0] === 0xff && body[1] === 0xfe) || (body[0] === 0xfe && body[1] === 0xff) ? 2 : 0;
    return dec(be ? 'utf-16be' : 'utf-16le', body.subarray(skip));
  }
  return dec(enc === 3 ? 'utf-8' : 'windows-1252', body);
}

/** USLT / ULT: encoding, language(3), content descriptor (terminated), lyrics text. */
function uslt(data) {
  const enc = data[0];
  let p = 4;
  if (enc === 1 || enc === 2) { while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2; p += 2; }
  else { while (p < data.length && data[p] !== 0) p++; p += 1; }
  return decodeText(enc, data.subarray(p)).replace(/\u0000+$/g, '');
}

function apic(data, v22) {
  const enc = data[0];
  let p = 1, mime;
  if (v22) { mime = 'image/' + ascii(data, 1, 3).toLowerCase().replace('jpg', 'jpeg'); p = 4; }
  else { let e = p; while (e < data.length && data[e] !== 0) e++; mime = ascii(data, p, e - p); p = e + 1; }
  const type = data[p]; p++;
  // skip description (terminated according to the text encoding)
  if (enc === 1 || enc === 2) { while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2; p += 2; }
  else { while (p < data.length && data[p] !== 0) p++; p += 1; }
  return { type, mime, bytes: data.subarray(p) };
}

async function readId3(file) {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (ascii(head, 0, 3) !== 'ID3') return null;
  const ver = head[3], flags = head[5], size = synchsafe(head, 6);
  let buf = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
  if (flags & 0x80 && ver < 4) { // undo unsynchronisation
    const out = []; for (let i = 0; i < buf.length; i++) { out.push(buf[i]); if (buf[i] === 0xff && buf[i + 1] === 0) i++; }
    buf = Uint8Array.from(out);
  }
  let p = 0;
  if (flags & 0x40) p = ver === 4 ? synchsafe(buf, 0) : u32be(buf, 0) + 4; // extended header
  const v22 = ver === 2, idLen = v22 ? 3 : 4, hdr = v22 ? 6 : 10;
  const tags = {}; let art = null, artType = -1;
  while (p + hdr <= buf.length) {
    const id = ascii(buf, p, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const fsize = v22 ? (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5] : ver === 4 ? synchsafe(buf, p + 4) : u32be(buf, p + 4);
    const data = buf.subarray(p + hdr, p + hdr + fsize);
    p += hdr + fsize;
    if (!fsize) continue;
    const map = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album', TRCK: 'track', TRK: 'track', TPE2: 'albumArtist', TP2: 'albumArtist' };
    if (map[id]) tags[map[id]] = textFrame(data);
    else if ((id === 'USLT' || id === 'ULT') && !tags.lyrics) tags.lyrics = [uslt(data)];
    else if (id === 'APIC' || id === 'PIC') {
      const pic = apic(data, v22);
      const rank = pic.type === 3 ? 100 : pic.type === 0 ? 50 : 10;
      if (rank > artType) { artType = rank; art = toBlob(pic.bytes, pic.mime); }
    }
  }
  return { ...tags, art };
}

/* ---------------- Vorbis comments (FLAC / Ogg) ---------------- */
function vorbisComments(b, o) {
  const out = {}; const pics = [];
  const vlen = u32le(b, o); o += 4 + vlen;
  const n = u32le(b, o); o += 4;
  for (let i = 0; i < n && o + 4 <= b.length; i++) {
    const len = u32le(b, o); o += 4;
    const s = dec('utf-8', b.subarray(o, o + len)); o += len;
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const k = s.slice(0, eq).toUpperCase(), v = s.slice(eq + 1);
    if (k === 'METADATA_BLOCK_PICTURE') pics.push(v);
    else (out[k] ||= []).push(v);
  }
  return { out, pics };
}

function flacPicture(b) {
  let o = 0;
  const type = u32be(b, o); o += 4;
  const ml = u32be(b, o); o += 4;
  const mime = ascii(b, o, ml); o += ml;
  const dl = u32be(b, o); o += 4 + dl + 16;
  const len = u32be(b, o); o += 4;
  return { type, mime, bytes: b.subarray(o, o + len) };
}

const fromVorbis = (out) => ({ title: out.TITLE, artist: out.ARTIST, album: out.ALBUM, albumArtist: out.ALBUMARTIST, track: out.TRACKNUMBER, lyrics: out.LYRICS || out.UNSYNCEDLYRICS });

async function readFlac(file) {
  const buf = new Uint8Array(await file.slice(0, 16 * 1024 * 1024).arrayBuffer());
  if (ascii(buf, 0, 4) !== 'fLaC') return null;
  let p = 4, res = {}, art = null, best = -1;
  while (p + 4 <= buf.length) {
    const last = buf[p] & 0x80, type = buf[p] & 0x7f, len = (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
    p += 4;
    const body = buf.subarray(p, p + len);
    if (type === 4) res = fromVorbis(vorbisComments(body, 0).out);
    else if (type === 6) {
      const pic = flacPicture(body);
      const rank = pic.type === 3 ? 100 : 10;
      if (rank > best) { best = rank; art = toBlob(pic.bytes, pic.mime); }
    }
    p += len;
    if (last) break;
  }
  return { ...res, art };
}

export async function readOgg(file) {
  const buf = new Uint8Array(await file.slice(0, 8 * 1024 * 1024).arrayBuffer());
  if (ascii(buf, 0, 4) !== 'OggS') return null;
  const packets = []; let cur = [], p = 0;
  while (p + 27 <= buf.length && packets.length < 2) {
    if (ascii(buf, p, 4) !== 'OggS') break;
    const nseg = buf[p + 26];
    let o = p + 27 + nseg, dataLen = 0;
    for (let i = 0; i < nseg; i++) {
      const sl = buf[p + 27 + i];
      cur.push(buf.subarray(o + dataLen, o + dataLen + sl)); dataLen += sl;
      if (sl < 255) { packets.push(cur); cur = []; if (packets.length === 2) break; }
    }
    p = o + dataLen;
  }
  if (packets.length < 2) return null;
  const join = (parts) => { const out = new Uint8Array(parts.reduce((a, s) => a + s.length, 0)); let q = 0; for (const s of parts) { out.set(s, q); q += s.length; } return out; };
  const pkt = join(packets[1]);
  let offset = -1;
  if (ascii(pkt, 0, 8) === 'OpusTags') offset = 8;
  else if (pkt[0] === 3 && ascii(pkt, 1, 6) === 'vorbis') offset = 7;
  if (offset < 0) return null;
  const { out, pics } = vorbisComments(pkt, offset);
  let art = null;
  for (const b64 of pics) {
    try {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const pic = flacPicture(raw);
      art = toBlob(pic.bytes, pic.mime);
      if (pic.type === 3) break;
    } catch { /* ignore broken picture */ }
  }
  return { ...fromVorbis(out), art };
}

/* ---------------- MP4 / M4A ---------------- */
function* atoms(b, start, end) {
  let p = start;
  while (p + 8 <= end) {
    let size = u32be(b, p); const type = ascii(b, p + 4, 4); let hdr = 8;
    if (size === 1) { size = u32be(b, p + 12); hdr = 16; } // 64-bit sizes: low word is enough for our use
    if (size === 0) size = end - p;
    if (size < hdr) return;
    yield { type, start: p + hdr, end: Math.min(p + size, end) };
    p += size;
  }
}

export async function readMp4(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (ascii(head, 4, 4) !== 'ftyp') return null;
  // walk top-level atoms with small reads to find moov
  let pos = 0, moov = null;
  while (pos < file.size) {
    const h = new Uint8Array(await file.slice(pos, pos + 16).arrayBuffer());
    let size = u32be(h, 0), hdr = 8;
    const type = ascii(h, 4, 4);
    if (size === 1) { size = u32be(h, 12); hdr = 16; }
    if (size === 0) size = file.size - pos;
    if (size < 8) break;
    if (type === 'moov') { moov = { start: pos + hdr, end: pos + size }; break; }
    pos += size;
  }
  if (!moov || moov.end - moov.start > 64 * 1024 * 1024) return null;
  const b = new Uint8Array(await file.slice(moov.start, moov.end).arrayBuffer());
  const find = (start, end, type) => { for (const a of atoms(b, start, end)) if (a.type === type) return a; return null; };
  const udta = find(0, b.length, 'udta'), meta = udta && find(udta.start, udta.end, 'meta');
  const ilst = meta && find(meta.start + 4, meta.end, 'ilst');
  if (!ilst) return {};
  const res = {}; let art = null;
  for (const item of atoms(b, ilst.start, ilst.end)) {
    const data = find(item.start, item.end, 'data');
    if (!data) continue;
    const payload = b.subarray(data.start + 8, data.end);
    const flag = u32be(b, data.start) & 0xffffff;
    if (item.type === '\u00a9nam') res.title = [dec('utf-8', payload)];
    else if (item.type === '\u00a9ART') res.artist = [dec('utf-8', payload)];
    else if (item.type === '\u00a9alb') res.album = [dec('utf-8', payload)];
    else if (item.type === '\u00a9lyr') res.lyrics = [dec('utf-8', payload)];
    else if (item.type === 'aART') res.albumArtist = [dec('utf-8', payload)];
    else if (item.type === 'trkn' && payload.length >= 4) res.track = [String((payload[2] << 8) | payload[3])];
    else if (item.type === 'covr') art = toBlob(payload, flag === 14 ? 'image/png' : 'image/jpeg');
  }
  return { ...res, art };
}

/* ---------------- public API ---------------- */
const first = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);

export async function readTags(file) {
  try {
    const raw = (await readId3(file)) || (await readFlac(file)) || (await readOgg(file)) || (await readMp4(file)) || {};
    const artists = [...new Set(first(raw.artist))];
    return {
      title: first(raw.title)[0] || '',
      artist: artists.length > 1 ? artists.join('; ') : artists[0] || '',
      album: first(raw.album)[0] || '',
      albumArtist: first(raw.albumArtist)[0] || '',
      trackNo: parseInt(first(raw.track)[0], 10) || 0,
      lyrics: (Array.isArray(raw.lyrics) && raw.lyrics[0] ? String(raw.lyrics[0]).replace(/\r\n?/g, '\n').trim() : '') || '',
      art: raw.art || null,
    };
  } catch (err) {
    if (globalThis.__TAGDEBUG) console.error(err);
    return { title: '', artist: '', album: '', albumArtist: '', trackNo: 0, art: null, lyrics: '' };
  }
}
