import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.DATABASE_PATH ?? join(root, 'data', 'hours-to-go.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });

const production = process.env.NODE_ENV === 'production';
const app = await buildApp({
  dbPath,
  secureCookies: production,
  staticDir: join(root, 'dist'),
  logger: true,
});

await app.listen({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
});
