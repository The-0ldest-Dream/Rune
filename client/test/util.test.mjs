import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTracks, artistKeyOf, albumKeyOf, UNKNOWN, rankByStats, fmtListened } from '../src/util.js';

const mk = (id, artist, album, trackNo = 0) => {
  const t = { id, title: `Song ${id}`, artist, album, trackNo };
  t.artistKey = artistKeyOf(t); t.albumKey = albumKeyOf(t);
  return t;
};

test('artists and albums appear only when two songs match', () => {
  const g = groupTracks([
    mk(1, 'Coldplay', 'Parachutes', 2), mk(2, 'coldplay ', 'PARACHUTES', 1), mk(3, 'Coldplay', 'Viva', 1),
    mk(4, 'Solo Artist', 'One Off'), mk(5, UNKNOWN, 'Mystery'), mk(6, UNKNOWN, 'Mystery'),
  ]);
  assert.deepEqual(g.artists.map((a) => a.name), ['Coldplay']);          // 3 Coldplay songs → artist; Solo has 1
  assert.equal(g.albums.length, 1);                                       // Parachutes has 2; Viva has 1
  assert.equal(g.albums[0].tracks[0].id, 2);                              // sorted by track number
  assert.equal(g.artists[0].albums.length, 1);
  assert.ok(!g.artistByKey.has(''));                                      // Unknown artists never group together
});

test('ranking and formatting', () => {
  const r = rankByStats([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { a: { plays: 1, seconds: 10 }, b: { plays: 3, seconds: 5 }, c: { plays: 1, seconds: 90 } });
  assert.deepEqual(r.map((x) => x.id), ['b', 'c', 'a']);
  assert.equal(fmtListened(45), '45s'); assert.equal(fmtListened(125), '2m 5s'); assert.equal(fmtListened(4000), '1h 6m');
});
