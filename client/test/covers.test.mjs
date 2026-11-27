import test from 'node:test';
import assert from 'node:assert/strict';
import { similarity, cleanTitle, pickBest, upscale, searchItunes, findCoverBlob, downloadImage } from '../src/coverSearch.js';

const json = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => body });

test('cleaning and similarity', () => {
  assert.equal(cleanTitle('Karma Police (Remastered 2009) [Live]'), 'Karma Police'); assert.equal(cleanTitle('Song - Remastered 2011'), 'Song');
  assert.ok(similarity('Fade Into You', 'fade into you!') === 1 && similarity('Fade Into You', 'Fade Out') < 0.5);
  assert.equal(upscale('https://is1.mzstatic.com/image/thumb/Music/a/100x100bb.jpg'), 'https://is1.mzstatic.com/image/thumb/Music/a/600x600bb.jpg');
});

test('picks the right search hit and refuses weak ones', () => {
  const t = { title: 'Fade Into You', artist: 'Mazzy Star' };
  const hits = [{ title: 'Fade Into You (Cover)', artist: 'Some Band', image: 'bad' }, { title: 'Fade Into You', artist: 'Mazzy Star', image: 'good' }, { title: 'Other', artist: 'Mazzy Star', image: 'no' }];
  assert.equal(pickBest(hits, t).image, 'good');
  assert.equal(pickBest([{ title: 'Completely Different', artist: 'Mazzy Star', image: 'x' }], t), null);
  assert.equal(pickBest([{ title: 'Fade Into You', artist: 'Totally Other', image: 'x' }], t), null);
});

test('iTunes query + fallback to MusicBrainz / Cover Art Archive', async () => {
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    if (url.includes('itunes.apple.com')) return { ok: true, status: 200, json: async () => ({ results: [] }) };
    if (url.includes('musicbrainz.org')) return { ok: true, status: 200, json: async () => ({ recordings: [{ title: 'Fade Into You', 'artist-credit': [{ name: 'Mazzy Star' }], releases: [{ id: 'r-missing' }, { id: 'r-ok' }] }] }) };
    if (url.includes('r-missing')) return { ok: false, status: 404, blob: async () => new Blob([]) };
    return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array(40)], { type: 'image/jpeg' }) };
  };
  const blob = await findCoverBlob({ title: 'Fade Into You (Remastered)', artist: 'Mazzy Star, Someone' }, { fetchFn, sleep: async () => {} });
  assert.equal(blob.type, 'image/jpeg');
  assert.ok(urls[0].includes('term=Fade+Into+You+Mazzy+Star'));
  assert.ok(urls.some((u) => u.includes('r-missing')) && urls.at(-1).includes('r-ok/front-500'));
  const none = await findCoverBlob({ title: 'Nothing', artist: 'Nobody' }, { fetchFn: json({ results: [], recordings: [] }), sleep: async () => {} });
  assert.equal(none, null);
  assert.deepEqual(await searchItunes({ title: 'X', artist: 'Y' }, { fetchFn: json({ results: [{ trackName: 'X', artistName: 'Y', artworkUrl100: 'https://a/100x100bb.jpg' }] }) }), ['https://a/600x600bb.jpg']);
  await assert.rejects(downloadImage('u', { fetchFn: async () => ({ ok: true, blob: async () => new Blob(['x'], { type: 'text/html' }) }) }), /not an image/);
  assert.equal((await findCoverBlob({ title: 'A', artist: 'B', imageUrl: 'https://i/x.jpg' }, { fetchFn: async () => ({ ok: true, status: 200, blob: async () => new Blob([new Uint8Array(9)], { type: 'image/png' }) }), sleep: async () => {} })).type, 'image/png');
});
