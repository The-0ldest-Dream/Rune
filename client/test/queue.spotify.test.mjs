import test from 'node:test';
import assert from 'node:assert/strict';
import { queueAdd } from '../src/queueOps.js';
import { parseSpotifyExport, parseCsv, matchSpotifyTrack } from '../src/spotify.js';
import { dupKeyOf, findDuplicateGroups, findMatch, artistInfo } from '../src/util.js';

const q = (...ids) => ids.map((id) => ({ id, qid: `q${id}` }));
const ids = (x) => x.queue.map((i) => i.id).join('');

test('add to queue moves an already-queued song to play next', () => {
  assert.equal(ids(queueAdd({ queue: q(...'ABCDE'), index: 2, item: { id: 'E' }, mode: 'end' })), 'ABCED');
  assert.equal(ids(queueAdd({ queue: q(...'ABCDE'), index: 2, item: { id: 'A' }, mode: 'end' })), 'BCADE');
  const a = queueAdd({ queue: q(...'ABCDE'), index: 2, item: { id: 'A' }, mode: 'end' }); assert.equal(a.index, 1);
  assert.equal(queueAdd({ queue: q(...'ABCDE'), index: 2, item: { id: 'D' }, mode: 'end' }).action, 'already-next');
  assert.equal(queueAdd({ queue: q(...'ABCDE'), index: 2, item: { id: 'C' }, mode: 'end' }).action, 'current');
  assert.equal(ids(queueAdd({ queue: q(...'ABC'), index: 0, item: { id: 'Z' }, mode: 'end' })), 'ABCZ');
  assert.equal(ids(queueAdd({ queue: q(...'ABC'), index: 0, item: { id: 'Z' }, mode: 'next' })), 'AZBC');
});

test('duplicates: same title + artist only; remixes are different songs', () => {
  const r = (id, title, artist, extra = {}) => ({ id, kind: 'local', title, artist, fileName: `${title}.mp3`, addedAt: Number(id.slice(1)), ...extra });
  assert.equal(dupKeyOf(r('a1', 'Mind Over Matter', 'Band, Band')), dupKeyOf(r('a2', 'mind over  matter', 'Band')));
  assert.notEqual(dupKeyOf(r('a1', 'Mind Over Matter', 'Band')), dupKeyOf(r('a2', 'Mind Over Matter (Remix)', 'Band')));
  assert.notEqual(dupKeyOf(r('a1', 'Home', 'Edith')), dupKeyOf(r('a2', 'Home', 'Someone Else')));
  const g = findDuplicateGroups([r('a1', 'X', 'B'), r('a2', 'X', 'B', { art: {} }), r('a3', 'X (Remix)', 'B'), r('g4', 'X', 'B', { kind: 'ghost' })]);
  assert.equal(g.length, 1); assert.equal(g[0].keep.id, 'a2'); assert.deepEqual(g[0].drop.map((d) => d.id).sort(), ['a1', 'g4']);
  assert.equal(findDuplicateGroups([r('a1', 'Intro', 'Unknown artist', { fileName: 'one.mp3' }), r('a2', 'Intro', 'Unknown artist', { fileName: 'two.mp3' })]).length, 0);
  assert.equal(findDuplicateGroups([r('a1', 'Intro', '', { fileName: 'same.mp3' }), r('a2', 'Intro', '', { fileName: 'same.mp3' })]).length, 1);
});

test('Spotify data export (JSON) and Exportify CSV', () => {
  const json = JSON.stringify({ playlists: [{ name: 'Road trip', items: [
    { track: { trackName: 'Fade Into You', artistName: 'Mazzy Star', albumName: 'So Tonight That I Might See', trackUri: 'spotify:track:1' }, episode: null },
    { track: null, localTrack: { trackName: 'My demo', artistName: 'Me', albumName: '' } }, { track: { trackName: '', artistName: 'x' } }] }, { name: 'Empty', items: [] }] });
  const p = parseSpotifyExport(json, 'Playlist1.json');
  assert.equal(p.playlists.length, 1); assert.deepEqual(p.playlists[0].tracks.map((t) => t.title), ['Fade Into You', 'My demo']);
  const csv = 'Track URI,Track Name,Album Name,Artist Name(s),Duration (ms),Album Image URL\n"spotify:track:9","Hello, World","Greatest ""Hits""","A, B",215000,https://i.scdn.co/image/x\n';
  const c = parseSpotifyExport(csv, 'Chill vibes.csv').playlists[0];
  assert.equal(c.name, 'Chill vibes'); assert.deepEqual([c.tracks[0].title, c.tracks[0].album, c.tracks[0].artist, c.tracks[0].duration, c.tracks[0].image], ['Hello, World', 'Greatest "Hits"', 'A, B', 215, 'https://i.scdn.co/image/x']);
  assert.equal(parseCsv('a,b\n"x\ny",2').length, 2);
  assert.deepEqual(parseSpotifyExport('nothing,here\n1,2', 'x.csv').playlists, []);
});

test('matching Spotify tracks to your songs; placeholders claim by title+artist with looser duration', () => {
  const song = (title, artist, duration) => { const i = artistInfo(artist); return { id: title, title, artist, artistKeys: i.artistKeys, duration }; };
  const lib = [song('Fade Into You', 'Mazzy Star', 296), song('Karma Police (Remastered)', 'Radiohead', 264), song('Fade Into You', 'Cover Band', 200)];
  assert.equal(matchSpotifyTrack({ title: 'Fade Into You', artist: 'Mazzy Star', duration: 295 }, lib).artist, 'Mazzy Star');
  assert.equal(matchSpotifyTrack({ title: 'Karma Police', artist: 'Radiohead', duration: 261 }, lib).title, 'Karma Police (Remastered)');
  assert.equal(matchSpotifyTrack({ title: 'Fade Into You', artist: 'Nobody', duration: 296 }, lib), null);
  assert.equal(matchSpotifyTrack({ title: 'Fade Into You', artist: 'Mazzy Star', duration: 500 }, lib), null);
  const ghost = { id: 'g', kind: 'ghost', sigKey: 'fade into you|mazzy star', duration: 295, tol: 8 };
  assert.equal(findMatch([ghost], { fp: 'x', sigKey: 'fade into you|mazzy star', duration: 301 })?.id, 'g');
});
