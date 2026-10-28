import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { printMail, resend } from './mail';

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

// Password-reset emails go through Resend in production. On a laptop they are printed, with
// links to the dev server's page.
const resendKey = process.env.RESEND_API_KEY;
const sendMail = resendKey ? resend(resendKey, process.env.MAIL_FROM || 'Hours to Go <no-reply@nberkyilmaz.com>') : production ? undefined : printMail;
const appUrl = process.env.APP_URL || (production ? undefined : 'http://localhost:5173/');
if (!sendMail || !appUrl) console.warn('Password reset emails are off: set RESEND_API_KEY and APP_URL.');

const app = await buildApp({
  database,
  secureCookies: production,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  staticDir: join(root, 'dist'),
  logger: true,
  sendMail,
  appUrl,
});

await app.listen({
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
});
