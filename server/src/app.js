import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { libraryRoutes } from './routes/library.js';
import { streamRoutes } from './routes/stream.js';
import { jamendoRoutes } from './routes/jamendo.js';
import { accountRoutes } from './routes/account.js';

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '5mb' })); // playlists can carry many track snapshots

  app.get('/api/health', (_req, res) => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM tracks').get();
    res.json({ ok: true, tracks: n, features: { jamendo: !!config.jamendoClientId } });
  });
  app.use('/api', libraryRoutes(db), streamRoutes(db), jamendoRoutes(), accountRoutes(db));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React client in production (npm run build && npm start).
  if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on the server' });
  });
  return app;
}
