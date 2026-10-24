// Optional real, Creative-Commons music via the Jamendo API (set JAMENDO_CLIENT_ID).
import { Router } from 'express';
import { config } from '../config.js';

export function jamendoRoutes() {
  const r = Router();
  r.get('/jamendo/search', async (req, res) => {
    if (!config.jamendoClientId) return res.status(501).json({ error: 'Jamendo is not configured (JAMENDO_CLIENT_ID)' });
    try {
      const params = new URLSearchParams({
        client_id: config.jamendoClientId, format: 'json', limit: '30', audioformat: 'mp31',
        order: req.query.q ? 'relevance' : 'popularity_week',
      });
      if (req.query.q) params.set('search', String(req.query.q));
      const up = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`);
      if (!up.ok) throw new Error(`Jamendo ${up.status}`);
      const data = await up.json();
      res.json({
        items: (data.results || []).filter((t) => t.audio).map((t) => ({
          id: `jm:${t.id}`, title: t.name, artist: t.artist_name, album: t.album_name || 'Single',
          duration: t.duration, cover: t.image || null,
          src: `/api/proxy?url=${encodeURIComponent(t.audio)}`,
        })),
      });
    } catch (e) {
      res.status(502).json({ error: 'Could not reach Jamendo' });
    }
  });
  return r;
}
