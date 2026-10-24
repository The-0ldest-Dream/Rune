// Optional accounts: register/login and a simple server-side backup of the user's playlists.
import { Router } from 'express';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../auth.js';
import { config } from '../config.js';

const hits = new Map(); // naive per-IP limiter for auth endpoints
function limited(req) {
  const now = Date.now(), key = req.ip;
  const list = (hits.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  list.push(now);
  hits.set(key, list);
  return list.length > 30;
}

export function accountRoutes(db) {
  const r = Router();

  const requireAuth = (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const payload = verifyToken(token, config.jwtSecret);
    if (!payload) return res.status(401).json({ error: 'Please sign in again' });
    req.userId = payload.uid;
    next();
  };
  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

  r.post('/auth/register', (req, res) => {
    if (limited(req)) return res.status(429).json({ error: 'Too many attempts, try again later' });
    const { email, password, name } = req.body || {};
    if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'Enter a valid email address' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (exists) return res.status(409).json({ error: 'An account with this email already exists' });
    const id = db.prepare('INSERT INTO users (email, name, pass_hash) VALUES (?, ?, ?)')
      .run(email.toLowerCase(), String(name || '').slice(0, 60) || email.split('@')[0], hashPassword(password)).lastInsertRowid;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json({ token: signToken({ uid: user.id }, config.jwtSecret), user: publicUser(user) });
  });

  r.post('/auth/login', (req, res) => {
    if (limited(req)) return res.status(429).json({ error: 'Too many attempts, try again later' });
    const { email, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
    if (!user || !verifyPassword(String(password || ''), user.pass_hash)) return res.status(401).json({ error: 'Email or password is incorrect' });
    res.json({ token: signToken({ uid: user.id }, config.jwtSecret), user: publicUser(user) });
  });

  r.get('/auth/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    user ? res.json({ user: publicUser(user) }) : res.status(401).json({ error: 'Account not found' });
  });

  r.get('/me/playlists', requireAuth, (req, res) => {
    const row = db.prepare('SELECT data FROM user_playlists WHERE user_id = ?').get(req.userId);
    res.json({ playlists: row ? JSON.parse(row.data) : [] });
  });

  r.put('/me/playlists', requireAuth, (req, res) => {
    const list = req.body?.playlists;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'playlists must be an array' });
    db.prepare(
      `INSERT INTO user_playlists (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP`
    ).run(req.userId, JSON.stringify(list));
    res.json({ ok: true });
  });

  return r;
}
