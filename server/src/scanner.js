// Scans MEDIA_DIR for audio files and registers them in the catalogue.
// Recognised layouts (first match wins):
//   media/Artist/Album/01 - Title.mp3
//   media/Artist - Title.mp3
//   media/anything.mp3             (artist = "Unknown Artist")
import fs from 'node:fs';
import path from 'node:path';
import { tx } from './db.js';

export const AUDIO_EXT = new Set(['.mp3', '.flac', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.wav', '.weba']);

function* walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full, base);
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) yield path.relative(base, full);
  }
}

export function parseRelPath(rel) {
  const parts = rel.split(path.sep);
  const base = path.basename(rel, path.extname(rel));
  let artist = 'Unknown Artist', album = 'Singles', title = base, trackNo = 1;
  const m = /^(\d{1,3})[\s._-]+(.+)$/.exec(base);
  if (m) { trackNo = Number(m[1]); title = m[2]; }
  if (parts.length >= 3) { artist = parts[0]; album = parts[1]; }
  else {
    const dash = /^(.+?)\s+-\s+(.+)$/.exec(title);
    if (dash) { artist = dash[1]; title = dash[2]; }
  }
  return { artist, album, title: title.trim(), trackNo };
}

export function scanMedia(db, mediaDir) {
  const found = new Set(walk(mediaDir));
  const findArtist = db.prepare('SELECT id FROM artists WHERE name = ?');
  const insArtist = db.prepare("INSERT INTO artists (name, genre) VALUES (?, 'Local')");
  const findAlbum = db.prepare('SELECT id FROM albums WHERE title = ? AND artist_id = ?');
  const insAlbum = db.prepare("INSERT INTO albums (title, artist_id, year, genre) VALUES (?, ?, NULL, 'Local')");
  const has = db.prepare('SELECT id FROM tracks WHERE file_path = ?');
  const insTrack = db.prepare(
    "INSERT INTO tracks (title, artist_id, album_id, track_no, duration, genre, source, file_path) VALUES (?, ?, ?, ?, 0, 'Local', 'file', ?)"
  );
  let added = 0, removed = 0;

  tx(db, () => {
    for (const rel of found) {
      if (has.get(rel)) continue;
      const meta = parseRelPath(rel);
      const artistId = (findArtist.get(meta.artist) || { id: insArtist.run(meta.artist).lastInsertRowid }).id;
      const albumId = (findAlbum.get(meta.album, artistId) || { id: insAlbum.run(meta.album, artistId).lastInsertRowid }).id;
      insTrack.run(meta.title, artistId, albumId, meta.trackNo, rel);
      added++;
    }
    // drop rows whose files disappeared
    for (const row of db.prepare("SELECT id, file_path FROM tracks WHERE source = 'file'").all()) {
      if (!found.has(row.file_path)) {
        db.prepare('DELETE FROM tracks WHERE id = ?').run(row.id);
        removed++;
      }
    }
    db.exec('DELETE FROM albums WHERE id NOT IN (SELECT album_id FROM tracks); DELETE FROM artists WHERE id NOT IN (SELECT artist_id FROM tracks);');
  });
  return { added, removed };
}
