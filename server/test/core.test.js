import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedCatalogue } from '../src/seed.js';
import { synthWav } from '../src/demoAudio.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/auth.js';
import { parseRelPath } from '../src/scanner.js';

test('seed creates thousands of tracks', () => {
  const db = openDb(':memory:');
  const r = seedCatalogue(db);
  assert.ok(r.tracks > 2000, `got ${r.tracks}`);
  const row = db.prepare('SELECT t.title, ar.name FROM tracks t JOIN artists ar ON ar.id=t.artist_id WHERE t.title LIKE ? LIMIT 1').get('%light%');
  assert.ok(row);
});

test('demo wav is valid and deterministic', () => {
  const a = synthWav(7, 'Jazz'), b = synthWav(7, 'Jazz'), c = synthWav(8, 'Jazz');
  assert.equal(a.toString('ascii', 0, 4), 'RIFF');
  assert.equal(a.length, 44 + 22050 * 30 * 2);
  assert.ok(a.equals(b));
  assert.ok(!a.equals(c));
});

test('auth helpers', () => {
  const h = hashPassword('hunter22');
  assert.ok(verifyPassword('hunter22', h));
  assert.ok(!verifyPassword('wrong', h));
  const t = signToken({ uid: 1 }, 's');
  assert.equal(verifyToken(t, 's').uid, 1);
  assert.equal(verifyToken(t, 'other'), null);
});

test('scanner path parsing', () => {
  assert.deepEqual(parseRelPath('Daft/Disc/03 - Title.mp3'), { artist: 'Daft', album: 'Disc', title: 'Title', trackNo: 3 });
  assert.equal(parseRelPath('Band - Song.flac').artist, 'Band');
});
