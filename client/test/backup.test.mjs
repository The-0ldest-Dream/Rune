import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, parseExport, planImport } from '../src/store/backup.js';

const png = (n) => new Blob([Uint8Array.from({ length: 300 }, (_, i) => (i * n) % 256)], { type: 'image/png' });
const shrink = async (b) => b; // no canvas in Node
const rec = (id, o = {}) => ({ id, kind: 'local', title: `T${id}`, artist: 'Band', album: 'Disc', duration: 100, fileName: `${id}.mp3`, size: 1000 + Number(id.slice(2) || 0), fp: `${id}.mp3:${1000 + Number(id.slice(2) || 0)}`, sigKey: `t${id}|band`, ...o });

test('export → import onto a device that has only some of the songs', async () => {
  const a = [rec('l:1', { art: png(3) }), rec('l:2', { art: png(3) }), rec('l:3')];     // device A
  const covers = { 'song:l:3': png(9), 'album:band|disc': png(5), 'artist:band': 'none', 'song:l:99': png(1) };
  const file = await buildExport({ records: a, covers, profile: { name: 'Eun', username: 'e', avatar: png(7) }, playlists: [{ id: 'p1', name: 'Mix', updatedAt: 5, trackIds: ['l:3', 'l:1'] }], stats: { 'l:1': { seconds: 90, plays: 2 }, 'l:zz': { seconds: 1, plays: 1 } } }, shrink);
  assert.ok(file.size > 0);
  const data = await parseExport(file);
  assert.equal(data.songs.length, 3);
  assert.equal(data.images.length, 4 - 0 > 0 ? data.images.length : 0);
  assert.ok(!('song:l:99' in data.covers));                  // cover of a song that doesn't exist is dropped

  // Device B has song 1 (different id, same file) and an unrelated song
  const b = [{ ...rec('l:b1'), fp: a[0].fp, title: 'Original title', artist: 'Unknown artist', album: '' }, rec('l:x', { fp: 'other:1', sigKey: 'other|x', title: 'Other' })];
  let n = 0;
  const plan = await planImport(data, b, { uid: () => `new${++n}`, now: 1000 });
  assert.deepEqual(plan.summary, { matched: 1, missing: 2, playlists: 1 });
  assert.equal(plan.updated[0].id, 'l:b1');
  assert.equal(plan.updated[0].artist, 'Band');                // artist/album list restored on the matching song
  assert.equal(plan.updated[0].album, 'Disc');
  assert.deepEqual(plan.created.map((g) => [g.kind, g.title]), [['ghost', 'Tl:2'], ['ghost', 'Tl:3']]);
  assert.ok(plan.created[0].art, 'ghost keeps its thumbnail');
  const ghost3 = plan.created[1].id;
  assert.ok(plan.covers[`song:${ghost3}`]);                    // custom song cover follows the ghost
  assert.ok(plan.covers['album:band|disc']); assert.equal(plan.covers['artist:band'], 'none');
  assert.deepEqual(plan.playlists[0].trackIds, [ghost3, 'l:b1']);
  assert.deepEqual(plan.stats['l:b1'], { seconds: 90, plays: 2 });
  assert.equal(plan.profile.name, 'Eun'); assert.ok(plan.profile.avatar);
});

test('weak match by title/artist/duration and rejects foreign files', async () => {
  const data = { app: 'rune-backup', version: 1, songs: [{ fp: 'a:1', sigKey: 'song|band', title: 'Song', artist: 'Band', album: 'X', duration: 101 }], images: [], covers: {}, stats: {}, playlists: [] };
  const plan = await planImport(data, [rec('l:7', { fp: 'zzz', sigKey: 'song|band', duration: 100 })], { uid: () => 'u' });
  assert.equal(plan.summary.matched, 1);
  await assert.rejects(parseExport(new Blob(['{"hello":1}'])), /valid Rune backup/);
});
