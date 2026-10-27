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

import { pickDominant, backdropFor } from '../src/util.js';
test('dominant colour comes from the whole cover, favouring vivid colours over white', () => {
  const px = (r, g, b, n) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
  const blueCover = Uint8ClampedArray.from([...px(82, 113, 255, 700), ...px(255, 255, 255, 250), ...px(240, 90, 160, 50)]);
  const [r, g, b] = pickDominant(blueCover);
  assert.ok(b > 200 && r < 120, `expected blue, got ${[r, g, b]}`);
  const bd = backdropFor([r, g, b]);
  assert.match(bd.c1, /^hsl\(2[0-9]{2} /);                       // blue hue
  const light = (c) => Number(/(\d+)%\)$/.exec(c)[1]);
  assert.ok(light(bd.c2) < light(bd.c1));                         // darker towards the bottom
  const grey = Uint8ClampedArray.from(px(128, 128, 128, 400));
  assert.deepEqual(pickDominant(grey).map(Math.round), [128, 128, 128]);
});

import { THEMES, buildVars, luminance } from '../src/themes.js';
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
test('every theme is readable', () => {
  for (const t of THEMES) {
    const v = buildVars(t.spec);
    assert.ok(contrast(v['--text'], v['--panel']) >= 7, `${t.id}: text on panel ${contrast(v['--text'], v['--panel']).toFixed(1)}`);
    assert.ok(contrast(v['--muted'], v['--panel']) >= 3.5, `${t.id}: muted text ${contrast(v['--muted'], v['--panel']).toFixed(1)}`);
    assert.ok(contrast(v['--accent-ink'], v['--accent']) >= 4.5, `${t.id}: text on accent`);
    assert.ok(contrast(v['--accent'], v['--panel']) >= 3, `${t.id}: accent on panel ${contrast(v['--accent'], v['--panel']).toFixed(1)}`);
    assert.ok(contrast(v['--on-text'], v['--text']) >= 7, `${t.id}: button text`);
  }
});
