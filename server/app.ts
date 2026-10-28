import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { validateEntry } from '../src/model/entry';
import { parseEntry, parseLogbook, parseProfile } from '../src/model/store';
import { Throttle, hashPassword, hashToken, newToken, verifyPassword } from './auth';
import { Store, type User } from './db';
import { resetMail, type SendMail } from './mail';

export interface AppOptions {
  /** A `postgres://` URL, or for PGlite a folder or `memory://`. See `Store.open`. */
  database: string;
  /** Mark the session cookie Secure. On in production, where the site is served over HTTPS. */
  secureCookies: boolean;
  /**
   * Pages on another origin allowed to call the API with the pilot's cookie,
   * such as `https://nberkyilmaz.com` when the page is published there and
   * the API runs on a subdomain. Empty when the page and API share an origin.
   */
  allowedOrigins?: string[];
  /** The built web app to serve alongside the API, if there is one. */
  staticDir?: string;
  logger?: boolean;
  /**
   * Sends the password-reset email, and the page's address the link in it points at, such as
   * `https://nberkyilmaz.com/hours-to-go/`. Taken from configuration, never from the request,
   * so nobody can have the email point somewhere else. Without both, resetting is unavailable.
   */
  sendMail?: SendMail | undefined;
  appUrl?: string | undefined;
}

const COOKIE = 'htg_session';
const SESSION_DAYS = 90;
const RESET_MINUTES = 60;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use a password of at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

const bodyOf = (req: FastifyRequest): Record<string, unknown> =>
  typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024, trustProxy: true });
  const store = await Store.open(opts.database, (err) => app.log.error(err, 'database connection dropped'));
  const throttle = new Throttle(10, 15 * 60_000);
  // Reset emails: a few to any one address, so nobody can flood someone's inbox, and a few more
  // from any one address on the internet.
  const resetsPerEmail = new Throttle(3, 60 * 60_000);
  const resetsPerIp = new Throttle(10, 60 * 60_000);
  app.addHook('onClose', async () => store.close());

  await app.register(cookie);
  if (opts.allowedOrigins?.length) {
    await app.register(cors, {
      origin: opts.allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      // Every save is a PUT with a JSON body, so each would otherwise be preceded by its own preflight.
      maxAge: 7200,
    });
  }
  app.decorateRequest('user', null);

  app.addHook('preHandler', async (req) => {
    const token = req.cookies[COOKIE];
    req.user = token ? await store.userForSession(hashToken(token), Date.now()) : null;
  });

  const setSessionCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.secureCookies,
      path: '/',
      maxAge: SESSION_DAYS * 86_400,
    });

  const startSession = async (reply: FastifyReply, user: User) => {
    const { token, hash } = newToken();
    await store.createSession(user.id, hash, Date.now() + SESSION_DAYS * 86_400_000);
    setSessionCookie(reply, token);
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
    const problem = passwordProblem(password);
    if (problem) return reply.code(400).send({ error: problem });
    const user = await store.createUser(email, await hashPassword(password));
    if (!user) return reply.code(409).send({ error: 'An account with that email already exists. Sign in instead.' });
    await startSession(reply, user);
    return { user: { email: user.email } };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = bodyOf(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const key = `${req.ip}|${email}`;
    if (throttle.blocked(key)) return reply.code(429).send({ error: 'Too many attempts. Try again in 15 minutes.' });
    const found = await store.findUserByEmail(email);
    const ok = found !== null && (await verifyPassword(password, found.passwordHash));
    if (!found || !ok) {
      throttle.fail(key);
      return reply.code(401).send({ error: 'Email or password is incorrect.' });
    }
    throttle.clear(key);
    await startSession(reply, found);
    return { user: { email: found.email } };
  });

  // The same answer whether or not the email has a profile, and as fast either way: the link is
  // made and sent after replying. Sign-up already says when an email is taken, so this hides
  // little today, but it costs nothing.
  app.post('/api/auth/forgot', async (req, reply) => {
    const { sendMail, appUrl } = opts;
    if (!sendMail || !appUrl) return reply.code(503).send({ error: 'Resetting a password by email isn’t available yet.' });
    const email = String(bodyOf(req).email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) return reply.code(400).send({ error: 'Enter a valid email address.' });
    if (resetsPerEmail.blocked(email) || resetsPerIp.blocked(req.ip)) {
      return reply.code(429).send({ error: 'Too many reset emails asked for. Try again in an hour.' });
    }
    resetsPerEmail.fail(email);
    resetsPerIp.fail(req.ip);
    void (async () => {
      const user = await store.findUserByEmail(email);
      if (!user) return;
      const { token, hash } = newToken();
      await store.createPasswordReset(user.id, hash, Date.now() + RESET_MINUTES * 60_000);
      // In the fragment, which browsers never send to a server, so the token stays out of logs.
      const link = new URL(appUrl);
      link.hash = `reset=${token}`;
      await sendMail(resetMail(user.email, link.toString(), RESET_MINUTES));
    })().catch((err: unknown) => app.log.error(err, 'password reset email not sent'));
    return reply.code(204).send();
  });

  app.post('/api/auth/reset', async (req, reply) => {
    const body = bodyOf(req);
    const token = String(body.token ?? '');
    const password = String(body.password ?? '');
    const problem = passwordProblem(password);
    if (problem) return reply.code(400).send({ error: problem });
    const key = `reset|${req.ip}`;
    if (throttle.blocked(key)) return reply.code(429).send({ error: 'Too many attempts. Try again in 15 minutes.' });
    const user = await store.resetPassword(hashToken(token), await hashPassword(password), Date.now());
    if (!user) {
      throttle.fail(key);
      return reply.code(400).send({ error: 'This link has expired or has already been used. Ask for a new one.' });
    }
    await startSession(reply, user);
    return { user: { email: user.email } };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await store.deleteSession(hashToken(token));
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  // The app asks this every time it opens, so each visit starts the 90 days again. Safari keeps a
  // cookie from an API on a different server than the page for only 7 days, so it is set again too.
  app.get('/api/me', { preHandler: requireUser }, async (req, reply) => {
    const token = req.cookies[COOKIE]!;
    await store.extendSession(hashToken(token), Date.now() + SESSION_DAYS * 86_400_000);
    setSessionCookie(reply, token);
    return { user: { email: req.user!.email } };
  });

  app.delete('/api/account', { preHandler: requireUser }, async (req, reply) => {
    const password = String(bodyOf(req).password ?? '');
    const stored = await store.passwordHashFor(req.user!.id);
    if (!stored || !(await verifyPassword(password, stored))) return reply.code(401).send({ error: 'That password is incorrect.' });
    await store.deleteUser(req.user!.id);
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
    await store.putEntry(req.user!.id, entry);
    return entry;
  });

  app.delete<{ Params: { id: string } }>('/api/entries/:id', { preHandler: requireUser }, async (req, reply) => {
    await store.deleteEntry(req.user!.id, req.params.id);
    return reply.code(204).send();
  });

  app.put('/api/profile', { preHandler: requireUser }, async (req) => {
    const profile = parseProfile(req.body);
    await store.putProfile(req.user!.id, profile);
    return profile;
  });

  app.post('/api/logbook/merge', { preHandler: requireUser }, async (req, reply) => {
    const incoming = parseLogbook(req.body);
    if (!incoming) return reply.code(400).send({ error: 'That is not a Hours to Go logbook.' });
    incoming.entries = incoming.entries.filter((e) => Object.keys(validateEntry(e)).length === 0);
    return store.merge(req.user!.id, incoming);
  });

  // For the host: up only when the database answers too.
  app.get('/api/health', async (_req, reply) => {
    try {
      await store.ping();
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false, error: 'The database is not answering.' });
    }
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
