// Generates a large, deterministic demo catalogue (artists → albums → tracks).
// Run with `npm run seed` (add --reset to wipe the catalogue first).
import { fileURLToPath } from 'node:url';
import { openDb, tx } from './db.js';
import { config } from './config.js';

import { generateCatalogue } from './catalogueData.js';

export { GENRES } from './catalogueData.js';

/** Inserts the generated catalogue; database ids are assigned by SQLite and mapped from the generated ones. */
export function seedCatalogue(db, opts = {}) {
  const cat = generateCatalogue(opts);
  const insArtist = db.prepare('INSERT INTO artists (name, genre) VALUES (?, ?)');
  const insAlbum = db.prepare('INSERT INTO albums (title, artist_id, year, genre) VALUES (?, ?, ?, ?)');
  const insTrack = db.prepare(
    "INSERT INTO tracks (title, artist_id, album_id, track_no, duration, genre, source) VALUES (?, ?, ?, ?, ?, ?, 'demo')"
  );
  const artistIds = new Map(), albumIds = new Map();
  tx(db, () => {
    for (const a of cat.artists) artistIds.set(a.id, insArtist.run(a.name, a.genre).lastInsertRowid);
    for (const a of cat.albums) albumIds.set(a.id, insAlbum.run(a.title, artistIds.get(a.artist_id), a.year, a.genre).lastInsertRowid);
    for (const t of cat.tracks) insTrack.run(t.title, artistIds.get(t.artist_id), albumIds.get(t.album_id), t.track_no, t.duration, t.genre);
  });
  return { artists: cat.artists.length, albums: cat.albums.length, tracks: cat.tracks.length };
}

export function seedIfEmpty(db) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM tracks WHERE source = 'demo'").get();
  return n === 0 ? seedCatalogue(db) : null;
}

// CLI: node src/seed.js [--reset]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(config.dbFile);
  if (process.argv.includes('--reset')) {
    db.exec("DELETE FROM tracks WHERE source='demo'; DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM tracks); DELETE FROM artists WHERE id NOT IN (SELECT artist_id FROM tracks);");
  }
  const res = seedIfEmpty(db);
  console.log(res ? `Seeded ${res.artists} artists, ${res.albums} albums, ${res.tracks} tracks.` : 'Catalogue already seeded.');
}
