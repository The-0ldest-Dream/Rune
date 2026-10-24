// Dependency-free password hashing (scrypt) and HS256 JWTs.
import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

const b64u = (v) => Buffer.from(v).toString('base64url');
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function signToken(payload, secret, ttlSeconds = 60 * 60 * 24 * 30) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${head}.${body}.${sign(`${head}.${body}`, secret)}`;
}

export function verifyToken(token, secret) {
  try {
    const [head, body, sig] = String(token).split('.');
    const expected = sign(`${head}.${body}`, secret);
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}
