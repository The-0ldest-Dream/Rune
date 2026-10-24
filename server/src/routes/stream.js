// Audio streaming with HTTP Range support (needed for seeking), plus an allow-listed proxy for Jamendo.
import path from 'node:path';
import { Readable } from 'node:stream';
import { Router } from 'express';
import { getDemoWav } from '../demoAudio.js';
import { config } from '../config.js';

function sendBuffer(req, res, buf, type) {
  res.set({ 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' });
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (!m) { res.set('Content-Length', buf.length); return res.end(buf); }
  let start, end;
  if (m[1] === '' && m[2] !== '') { start = Math.max(buf.length - parseInt(m[2]), 0); end = buf.length - 1; }
  else { start = parseInt(m[1] || '0'); end = m[2] ? Math.min(parseInt(m[2]), buf.length - 1) : buf.length - 1; }
  if (Number.isNaN(start) || start > end) return res.status(416).set('Content-Range', `bytes */${buf.length}`).end();
  res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1 });
  res.end(buf.subarray(start, end + 1));
}

const hostAllowed = (u) => u.protocol === 'https:' && /(^|\.)jamendo\.com$/.test(u.hostname);

export function streamRoutes(db) {
  const r = Router();

  r.get('/stream/:id', (req, res, next) => {
    const t = db.prepare('SELECT id, genre, source, file_path FROM tracks WHERE id = ?').get(Number(req.params.id));
    if (!t) return res.status(404).json({ error: 'Track not found' });
    if (t.source === 'demo') return sendBuffer(req, res, getDemoWav(t.id, t.genre), 'audio/wav');
    const abs = path.resolve(config.mediaDir, t.file_path);
    if (!abs.startsWith(config.mediaDir + path.sep)) return res.status(400).json({ error: 'Bad path' });
    res.sendFile(abs, { dotfiles: 'allow', maxAge: '1d' }, (err) => err && next(err)); // sendFile handles Range
  });

  // Same-origin proxy so Jamendo audio can flow through the Web Audio equalizer (their CDN CORS isn't guaranteed).
  r.get('/proxy', async (req, res) => {
    try {
      let url;
      try { url = new URL(String(req.query.url)); } catch { return res.status(400).json({ error: 'Invalid url' }); }
      const headers = req.headers.range ? { Range: req.headers.range } : {};
      let up;
      for (let hop = 0; hop < 4; hop++) {
        if (!hostAllowed(url)) return res.status(400).json({ error: 'Host not allowed' });
        up = await fetch(url, { headers, redirect: 'manual' });
        if (up.status >= 300 && up.status < 400 && up.headers.get('location')) { url = new URL(up.headers.get('location'), url); continue; }
        break;
      }
      res.status(up.status);
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const v = up.headers.get(h);
        if (v) res.set(h, v);
      }
      if (!up.body) return res.end();
      const body = Readable.fromWeb(up.body);
      req.on('close', () => body.destroy());
      body.on('error', () => res.end());
      body.pipe(res);
    } catch {
      if (!res.headersSent) res.status(502).json({ error: 'Upstream unavailable' });
    }
  });

  return r;
}
