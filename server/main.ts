import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const production = process.env.NODE_ENV === 'production';

// A Postgres URL (Neon in production), or a folder for PGlite. Production must say which: a
// host's own disk is usually wiped on every deploy, and every profile with it.
const database = process.env.DATABASE_URL || (production ? null : join(root, 'data', 'pglite'));
if (!database) {
  console.error('Set DATABASE_URL to a postgres:// URL, or to a folder on a disk that survives deploys.');
  process.exit(1);
}
if (!/^[a-z]+:\/\//.test(database)) mkdirSync(database, { recursive: true });

const app = await buildApp({
  database,
  secureCookies: production,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  staticDir: join(root, 'dist'),
  logger: true,
});

await app.listen({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
});
