import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { validateEntry } from '../src/model/entry';
import { parseEntry, parseLogbook, parseProfile } from '../src/model/store';
import { Throttle, hashPassword, hashToken, newSessionToken, verifyPassword } from './auth';
import { Store, type User } from './db';

export interface AppOptions {
  dbPath: string;
  /** Mark the session cookie Secure. On in production, where the site is served over HTTPS. */
  secureCookies: boolean;
  /** The built web app to serve alongside the API, if there is one. */
  staticDir?: string;
  logger?: boolean;
}

const COOKIE = 'htg_session';
const SESSION_DAYS = 90;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

const bodyOf = (req: FastifyRequest): Record<string, unknown> =>
  typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const store = new Store(opts.dbPath);
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024, trustProxy: true });
  const throttle = new Throttle(10, 15 * 60_000);
  app.addHook('onClose', async () => store.close());

  await app.register(cookie);
  app.decorateRequest('user', null);

  app.addHook('preHandler', async (req) => {
    const token = req.cookies[COOKIE];
    req.user = token ? store.userForSession(hashToken(token), Date.now()) : null;
  });

  const startSession = (reply: FastifyReply, user: User) => {
    const { token, hash } = newSessionToken();
    store.createSession(user.id, hash, Date.now() + SESSION_DAYS * 86_400_000);
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.secureCookies,
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    });
  };

  const requireUser = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) return reply.code(401).send({ error: 'Sign in to continue.' });
  };

  // --- Accounts --------------------------------------------------------------

  app.post('/api/auth/signup', async (req, reply) => {
    const body = bodyOf(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!EMAIL.test(email) || email.length > 254) return reply.code(400).send({ error: 'Enter a valid email address.' });
    if (password.length < 8) return reply.code(400).send({ error: 'Use a password of at least 8 characters.' });
    if (password.length > 200) return reply.code(400).send({ error: 'That password is too long.' });
    const user = store.createUser(email, await hashPassword(password));
    if (!user) return reply.code(409).send({ error: 'An account with that email already exists. Sign in instead.' });
    startSession(reply, user);
    return { user: { email: user.email } };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = bodyOf(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const key = `${req.ip}|${email}`;
    if (throttle.blocked(key)) return reply.code(429).send({ error: 'Too many attempts. Try again in 15 minutes.' });
    const found = store.findUserByEmail(email);
    const ok = found !== null && (await verifyPassword(password, found.passwordHash));
    if (!found || !ok) {
      throttle.fail(key);
      return reply.code(401).send({ error: 'Email or password is incorrect.' });
    }
    throttle.clear(key);
    startSession(reply, found);
    return { user: { email: found.email } };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) store.deleteSession(hashToken(token));
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/me', { preHandler: requireUser }, async (req) => ({ user: { email: req.user!.email } }));

  app.delete('/api/account', { preHandler: requireUser }, async (req, reply) => {
    const password = String(bodyOf(req).password ?? '');
    const stored = store.passwordHashFor(req.user!.id);
    if (!stored || !(await verifyPassword(password, stored))) return reply.code(401).send({ error: 'That password is incorrect.' });
    store.deleteUser(req.user!.id);
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  // --- Logbook ---------------------------------------------------------------

  app.get('/api/logbook', { preHandler: requireUser }, async (req) => store.getLogbook(req.user!.id));

  app.put<{ Params: { id: string } }>('/api/entries/:id', { preHandler: requireUser }, async (req, reply) => {
    const entry = parseEntry(req.body);
    if (!entry || entry.id !== req.params.id) return reply.code(400).send({ error: 'That entry is not valid.' });
    const errors = Object.values(validateEntry(entry));
    if (errors.length > 0) return reply.code(400).send({ error: errors.join(' ') });
    store.putEntry(req.user!.id, entry);
    return entry;
  });

  app.delete<{ Params: { id: string } }>('/api/entries/:id', { preHandler: requireUser }, async (req, reply) => {
    store.deleteEntry(req.user!.id, req.params.id);
    return reply.code(204).send();
  });

  app.put('/api/profile', { preHandler: requireUser }, async (req) => {
    const profile = parseProfile(req.body);
    store.putProfile(req.user!.id, profile);
    return profile;
  });

  app.post('/api/logbook/merge', { preHandler: requireUser }, async (req, reply) => {
    const incoming = parseLogbook(req.body);
    if (!incoming) return reply.code(400).send({ error: 'That is not a Hours to Go logbook.' });
    incoming.entries = incoming.entries.filter((e) => Object.keys(validateEntry(e)).length === 0);
    return store.merge(req.user!.id, incoming);
  });

  app.all('/api/*', async (_req, reply) => reply.code(404).send({ error: 'Not found.' }));

  // --- The web app -------------------------------------------------------------

  const staticDir = opts.staticDir;
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: staticDir, wildcard: false });
    // Client-side tabs share one page, so any other path gets the app.
    app.get('/*', async (_req, reply) => reply.sendFile('index.html'));
  }

  return app;
}
