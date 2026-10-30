import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTracks, artistKeyOf, albumKeyOf, artistInfo, parseArtists, UNKNOWN, rankByStats, fmtListened } from '../src/util.js';

const mk = (id, artist, album, trackNo = 0, albumArtist = '') => {
  const t = { id, title: `Song ${id}`, artist, album, trackNo };
  const info = artistInfo(artist, albumArtist);
  Object.assign(t, { artist: info.artist || UNKNOWN, artists: info.artists, artistKeys: info.artistKeys, artistKey: info.artistKey, albumArtistName: info.albumArtistName, albumArtistKey: info.albumArtistKey });
  t.albumKey = info.albumArtistKey && album ? `${info.albumArtistKey}|${album.toLowerCase().trim()}` : '';
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


test('duplicate and multiple artists', () => {
  assert.deepEqual(parseArtists('Radiohead, Radiohead'), ['Radiohead']);
  assert.deepEqual(parseArtists('radiohead,  RADIOHEAD ,Radiohead'), ['radiohead']);
  assert.deepEqual(parseArtists('Lana Del Rey, Bleachers, Lana Del Rey, Bleachers'), ['Lana Del Rey', 'Bleachers']);
  assert.deepEqual(parseArtists('Doja Cat feat. SZA'), ['Doja Cat', 'SZA']);
  assert.deepEqual(parseArtists('JVKE, Jake Lawson, Someone'), ['JVKE', 'Jake Lawson', 'Someone']);
  assert.deepEqual(parseArtists('Simon & Garfunkel'), ['Simon & Garfunkel']);          // "&" is part of a name
  assert.deepEqual(parseArtists('AC/DC'), ['AC/DC']);
  assert.deepEqual(parseArtists('Tyler, The Creator, Frank Ocean'), ['Tyler, The Creator', 'Frank Ocean']);
  assert.deepEqual(parseArtists('Earth, Wind & Fire'), ['Earth, Wind & Fire']);
  assert.deepEqual(parseArtists('Brand, New; Other'), ['Brand, New', 'Other']);          // ";" is explicit: commas stay inside names
  assert.deepEqual(parseArtists('Unknown artist'), []); assert.deepEqual(parseArtists(''), []);
  assert.equal(artistKeyOf({ artist: 'Radiohead, Radiohead' }), artistKeyOf({ artist: 'Radiohead' }));
});

test('same artist written two ways makes ONE artist; co-artists get the song too', () => {
  const g = groupTracks([
    mk(1, 'Radiohead', 'OK Computer', 1), mk(2, 'Radiohead, Radiohead', 'OK Computer', 2), mk(3, 'Radiohead', 'Kid A', 1),
    mk(4, 'Lana Del Rey, Bleachers, Lana Del Rey, Bleachers', 'Norman', 1), mk(5, 'Lana Del Rey', 'Norman', 2), mk(6, 'Bleachers', 'Strange Desire', 1),
    mk(7, 'Bleachers, Lana Del Rey', 'Singles', 1, 'Bleachers'),
  ]);
  assert.deepEqual(g.artists.map((a) => a.name), ['Bleachers', 'Lana Del Rey', 'Radiohead']);
  const radiohead = g.artistByKey.get('radiohead');
  assert.equal(radiohead.tracks.length, 3);                                              // not split into two artists
  assert.equal(g.albumByKey.get('radiohead|ok computer').tracks.length, 2);               // "Radiohead, Radiohead" joins the same album
  const lana = g.artistByKey.get('lana del rey'), bleachers = g.artistByKey.get('bleachers');
  assert.deepEqual(lana.tracks.map((t) => String(t.id)).sort(), ['4', '5', '7']);
  assert.deepEqual(bleachers.tracks.map((t) => String(t.id)).sort(), ['4', '6', '7']);     // the duet is under both names
  assert.equal(g.albumByKey.get('lana del rey|norman').tracks.length, 2);
  assert.equal(mk(7, 'Bleachers, Lana Del Rey', 'Singles', 1, 'Bleachers').albumKey, 'bleachers|singles'); // album-artist tag wins when it names a credited artist
  assert.equal(mk(8, 'Band', 'X', 1, 'Various Artists').albumKey, 'band|x');             // unrelated album-artist is ignored
});
