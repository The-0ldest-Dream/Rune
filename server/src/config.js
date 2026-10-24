// Central configuration. Reads ../../.env (if present) using Node's built-in loader.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* no .env file – defaults are fine for development */
}

const env = process.env;

export const config = {
  port: Number(env.PORT) || 3001,
  dbFile: path.resolve(ROOT, env.DB_FILE || 'server/data/rune.db'),
  mediaDir: path.resolve(ROOT, env.MEDIA_DIR || 'server/media'),
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
  jamendoClientId: env.JAMENDO_CLIENT_ID || '',
  corsOrigin: env.CORS_ORIGIN || '',
  clientDist: path.join(ROOT, 'client/dist'),
  production: env.NODE_ENV === 'production',
};

if (config.production && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}
