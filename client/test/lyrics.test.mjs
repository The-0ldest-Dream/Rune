import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLrc, activeLine, fetchOnline, hasLyrics } from '../src/lyrics.js';

test('parses synced LRC with offsets, multiple stamps and metadata', () => {
  const r = parseLrc('[ti:Song]\n[ar:Band]\n[offset:+500]\n[00:01.00]Hello\n[00:05.50][01:00.00]Chorus line\n\n[00:09]Last');
  assert.equal(r.synced, true);
  assert.deepEqual(r.lines.map((l) => [Math.round(l.t * 100) / 100, l.text]), [[1.5, 'Hello'], [6, 'Chorus line'], [9.5, 'Last'], [60.5, 'Chorus line']]);
});

test('plain lyrics stay unsynced; a single stamp does not count as synced', () => {
  const p = parseLrc('Line one\nLine two\n\nLine three');
  assert.equal(p.synced, false); assert.equal(p.lines.length, 4); assert.equal(p.lines[0].t, null);
  assert.equal(parseLrc('[00:03.00]only one').synced, false);
});

test('finds the active line', () => {
  const { lines } = parseLrc('[00:01]a\n[00:05]b\n[00:09]c');
  assert.equal(activeLine(lines, 0), -1); assert.equal(activeLine(lines, 1), 0); assert.equal(activeLine(lines, 7), 1); assert.equal(activeLine(lines, 99), 2);
  assert.ok(hasLyrics({ raw: 'x' })); assert.ok(!hasLyrics({ miss: true, raw: 'x' })); assert.ok(!hasLyrics(null));
});

test('online lookup: exact match, fallback search, miss and unknown artist', async () => {
  const mk = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });
  const t = { title: 'Song', artist: 'Band', album: 'Disc', duration: 200 };
  assert.equal(await fetchOnline(t, mk(200, { syncedLyrics: '[00:01]x\n[00:02]y' })), '[00:01]x\n[00:02]y');
  assert.equal(await fetchOnline(t, mk(200, { plainLyrics: 'plain' })), 'plain');
  const calls = [];
  const fetcher = async (url) => { calls.push(url); return url.includes('/get?') ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => [{ duration: 500, plainLyrics: 'far' }, { duration: 201, syncedLyrics: '[00:01]near\n[00:03]ok' }] }; };
  assert.equal(await fetchOnline(t, fetcher), '[00:01]near\n[00:03]ok'); assert.equal(calls.length, 2);
  assert.equal(await fetchOnline(t, async () => ({ ok: false, status: 404 })), null);
  assert.equal(await fetchOnline({ ...t, artist: 'Unknown artist' }, mk(200, {})), null);
  await assert.rejects(fetchOnline(t, async () => ({ ok: false, status: 500 })), /lyrics service/);
});

import { lineProgress } from '../src/lyrics.js';
import { bassEnergy, followLevel, glowAmount } from '../src/beat.js';
test('line progress sweeps from 0 to 1 and is capped for long gaps', () => {
  const { lines } = parseLrc('[00:10]a\n[00:14]b\n[01:00]c');
  assert.equal(lineProgress(lines, 0, 10), 0); assert.equal(lineProgress(lines, 0, 12), 0.5); assert.equal(lineProgress(lines, 0, 20), 1);
  assert.equal(lineProgress(lines, 1, 18), 0.5);          // 46 s gap is treated as 8 s
  assert.equal(lineProgress(lines, -1, 5), 0);
});
test('beat glow reacts to bass hits only', () => {
  const quiet = new Uint8Array(256).fill(20), hit = new Uint8Array(256); hit.fill(10); for (let i = 0; i < 6; i++) hit[i] = 255;
  assert.ok(bassEnergy(hit) > 0.7 && bassEnergy(quiet) < 0.1);
  let level = 0; for (let i = 0; i < 5; i++) level = followLevel(level, 1);
  assert.ok(level > 0.9);
  const down = followLevel(1, 0); assert.ok(down > 0.85 && down < 1);              // slow release
  assert.ok(glowAmount(0.9, 0.3) > glowAmount(0.9, 0.9));                          // a rise beats steady loudness
  assert.ok(glowAmount(0, 0) === 0 && glowAmount(1, 0) === 1);
});
