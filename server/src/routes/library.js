// Catalogue browsing: tracks, albums, artists, genres, generated cover art, rescan.
import { Router } from 'express';
import { scanMedia } from '../scanner.js';
import { config } from '../config.js';
import { coverSvg } from '../cover.js';

const TRACK_SELECT = `SELECT t.id, t.title, t.artist_id, t.album_id, t.track_no, t.duration, t.genre, t.source,
  ar.name AS artist, al.title AS album
  FROM tracks t JOIN artists ar ON ar.id = t.artist_id JOIN albums al ON al.id = t.album_id`;

const like = (s) => `%${String(s).replace(/[%_\\]/g, (c) => '\\' + c)}%`;
const page = (q) => ({
  limit: Math.min(Math.max(parseInt(q.limit) || 50, 1), 200),
  offset: Math.max(parseInt(q.offset) || 0, 0),
});

export function libraryRoutes(db) {
  const r = Router();

  r.get('/tracks', (req, res) => {
    const { limit, offset } = page(req.query);
    const where = [], args = [];
    if (req.query.q) {
      where.push("(t.title LIKE ? ESCAPE '\\' OR ar.name LIKE ? ESCAPE '\\' OR al.title LIKE ? ESCAPE '\\')");
      args.push(like(req.query.q), like(req.query.q), like(req.query.q));
    }
    if (req.query.genre) { where.push('t.genre = ?'); args.push(req.query.genre); }
    if (req.query.artist) { where.push('t.artist_id = ?'); args.push(Number(req.query.artist)); }
    if (req.query.album) { where.push('t.album_id = ?'); args.push(Number(req.query.album)); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const order = req.query.sort === 'random' ? 'RANDOM()' : 'ar.name, al.title, t.track_no';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM tracks t JOIN artists ar ON ar.id=t.artist_id JOIN albums al ON al.id=t.album_id${w}`).get(...args).n;
    const items = db.prepare(`${TRACK_SELECT}${w} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, limit, offset);
    res.json({ items, total });
  });

  r.get('/tracks/:id', (req, res) => {
    const row = db.prepare(`${TRACK_SELECT} WHERE t.id = ?`).get(Number(req.params.id));
    row ? res.json(row) : res.status(404).json({ error: 'Track not found' });
  });

  r.get('/albums', (req, res) => {
    const { limit, offset } = page(req.query);
    const where = [], args = [];
    if (req.query.q) { where.push("(al.title LIKE ? ESCAPE '\\' OR ar.name LIKE ? ESCAPE '\\')"); args.push(like(req.query.q), like(req.query.q)); }
    if (req.query.genre) { where.push('al.genre = ?'); args.push(req.query.genre); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const order = req.query.sort === 'random' ? 'RANDOM()' : 'al.title';
    const from = 'FROM albums al JOIN artists ar ON ar.id = al.artist_id';
    const total = db.prepare(`SELECT COUNT(*) AS n ${from}${w}`).get(...args).n;
    const items = db.prepare(
      `SELECT al.id, al.title, al.year, al.genre, al.artist_id, ar.name AS artist,
        (SELECT COUNT(*) FROM tracks t WHERE t.album_id = al.id) AS tracks
       ${from}${w} ORDER BY ${order} LIMIT ? OFFSET ?`
    ).all(...args, limit, offset);
    res.json({ items, total });
  });

  r.get('/albums/:id', (req, res) => {
    const id = Number(req.params.id);
    const album = db.prepare('SELECT al.id, al.title, al.year, al.genre, al.artist_id, ar.name AS artist FROM albums al JOIN artists ar ON ar.id=al.artist_id WHERE al.id = ?').get(id);
    if (!album) return res.status(404).json({ error: 'Album not found' });
    const tracks = db.prepare(`${TRACK_SELECT} WHERE t.album_id = ? ORDER BY t.track_no`).all(id);
    res.json({ ...album, tracks });
  });

  r.get('/artists', (req, res) => {
    const { limit, offset } = page(req.query);
    const where = [], args = [];
    if (req.query.q) { where.push("name LIKE ? ESCAPE '\\'"); args.push(like(req.query.q)); }
    if (req.query.genre) { where.push('genre = ?'); args.push(req.query.genre); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) AS n FROM artists${w}`).get(...args).n;
    const items = db.prepare(
      `SELECT a.id, a.name, a.genre,
        (SELECT COUNT(*) FROM albums al WHERE al.artist_id = a.id) AS albums
       FROM artists a${w} ORDER BY a.name LIMIT ? OFFSET ?`
    ).all(...args, limit, offset);
    res.json({ items, total });
  });

  r.get('/artists/:id', (req, res) => {
    const id = Number(req.params.id);
    const artist = db.prepare('SELECT id, name, genre FROM artists WHERE id = ?').get(id);
    if (!artist) return res.status(404).json({ error: 'Artist not found' });
    const albums = db.prepare('SELECT id, title, year, genre FROM albums WHERE artist_id = ? ORDER BY year DESC, title').all(id);
    const tracks = db.prepare(`${TRACK_SELECT} WHERE t.artist_id = ? ORDER BY al.year DESC, al.title, t.track_no`).all(id);
    res.json({ ...artist, albums, tracks });
  });

  r.get('/genres', (_req, res) => {
    res.json(db.prepare('SELECT genre AS name, COUNT(*) AS tracks FROM tracks GROUP BY genre ORDER BY tracks DESC').all());
  });

  // Generated SVG album art (deterministic from the album id).
  r.get('/cover/:id.svg', (req, res) => {
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=604800').send(coverSvg(req.params.id));
  });

  r.post('/library/rescan', (_req, res) => {
    res.json(scanMedia(db, config.mediaDir));
  });

  return r;
}
