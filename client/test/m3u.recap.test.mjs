import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlaylist, matchEntries, buildM3U } from '../src/m3u.js';
import { dayKey, lastDays, summarize, perMonth } from '../src/recap.js';

const T = (id, artist, title, fileName, duration = 200) => ({ id, artist, title, fileName, duration });
const lib = [T('a', 'Band', 'One', 'Band - One.mp3'), T('b', 'Band', 'Two', '02 Two.flac', 180), T('c', 'Solo', 'Three', 'three.m4a', 100)];

test('parses M3U8 with EXTINF and Windows paths, and PLS', () => {
  const m = parsePlaylist('\uFEFF#EXTM3U\n#EXTINF:200,Band - One\nC:\\Music\\Band - One.mp3\n#EXTINF:-1,Two\n/home/me/02 Two.flac\nrelative/zzz.mp3\n');
  assert.deepEqual(m.map((e) => e.path), ['C:\\Music\\Band - One.mp3', '/home/me/02 Two.flac', 'relative/zzz.mp3']);
  assert.deepEqual([m[0].artist, m[0].title, m[0].duration, m[1].title, m[1].duration], ['Band', 'One', 200, 'Two', undefined]);
  const p = parsePlaylist('[playlist]\nFile1=a.mp3\nTitle1=Band - One\nLength1=200\nFile2=b.mp3\nNumberOfEntries=2');
  assert.equal(p.length, 2); assert.equal(p[0].artist, 'Band');
});

test('matches by file name, by "Artist - Title", and by tags; reports the rest', () => {
  const entries = parsePlaylist('#EXTINF:100,Solo - Three\nunknown-name.mp3\n#EXTINF:200,Band - One\nBand - One.mp3\nnothing.mp3\n/x/02 Two.flac\n/x/Band - One.mp3');
  const r = matchEntries(entries, lib);
  assert.deepEqual(r.ids, ['c', 'a', 'b']); assert.equal(r.missing, 1);          // duplicates collapse
});

test('builds M3U that parses back', () => {
  const text = buildM3U('Mix', lib);
  assert.match(text, /^#EXTM3U\n#PLAYLIST:Mix\n#EXTINF:200,Band - One\nBand - One\.mp3\n/);
  assert.equal(matchEntries(parsePlaylist(text), lib).ids.length, 3);
});

test('recap: week summary, best day, top songs/artists, monthly totals', () => {
  const end = new Date(2026, 9, 28);
  const days = lastDays(7, end);
  assert.equal(days.length, 7); assert.equal(days[6], '2026-10-28'); assert.equal(days[0], '2026-10-22');
  const daily = {
    '2026-10-28': { songs: { a: 300, b: 60 }, plays: 3 }, '2026-10-26': { songs: { a: 100 }, plays: 1 }, '2026-09-01': { songs: { c: 500 }, plays: 2 }, '2025-12-31': { songs: { c: 50 }, plays: 1 },
  };
  const byId = new Map([['a', { id: 'a', title: 'One', artist: 'Band', artists: ['Band'] }], ['b', { id: 'b', title: 'Two', artist: 'Band', artists: ['Band'] }], ['c', { id: 'c', title: 'Three', artist: 'Solo', artists: ['Solo'] }]]);
  const s = summarize(daily, days, byId);
  assert.equal(s.seconds, 460); assert.equal(s.plays, 4); assert.equal(s.activeDays, 2); assert.equal(s.bestDay.key, '2026-10-28');
  assert.deepEqual(s.topSongs.map((x) => [x.id, x.seconds]), [['a', 400], ['b', 60]]);
  assert.deepEqual(s.topArtists, [{ name: 'Band', seconds: 460 }]);
  const m = perMonth(daily, 2026);
  assert.equal(m[9], 460); assert.equal(m[8], 500); assert.equal(m.reduce((a, b) => a + b, 0), 960);
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});
