// SQLite via Node's built-in `node:sqlite` module (Node >= 22.13) – no native build step.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  genre TEXT
);
CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  year INTEGER,
  genre TEXT
);
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  track_no INTEGER DEFAULT 1,
  duration INTEGER DEFAULT 0,
  genre TEXT,
  source TEXT NOT NULL DEFAULT 'demo',   -- 'demo' (synthesised) | 'file' (from MEDIA_DIR)
  file_path TEXT UNIQUE                  -- relative to MEDIA_DIR for source='file'
);
CREATE INDEX IF NOT EXISTS idx_tracks_album  ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist_id);
CREATE INDEX IF NOT EXISTS idx_tracks_genre  ON tracks(genre);
CREATE INDEX IF NOT EXISTS idx_tracks_title  ON tracks(title);
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist_id);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  pass_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_playlists (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Run `fn` inside a transaction; rolls back on error. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
