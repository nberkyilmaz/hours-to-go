import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { validateEntry } from '../src/model/entry';
import { parseEntry, parseLogbook, parseProfile } from '../src/model/store';
import { Throttle, hashPassword, hashToken, newToken, verifyPassword } from './auth';
import { Store, type Account, type User } from './db';
import { alertMail, confirmMail, feedbackMail, resetMail, type SendMail } from './mail';

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
  /** The owner's address, where "Send feedback" goes. Without it (or `sendMail`), feedback is unavailable. */
  feedbackTo?: string | undefined;
  /** Where an email goes when something fails that the pilot didn't cause. Without it, failures are only logged. */
  alertTo?: string | undefined;
}

const COOKIE = 'htg_session';
const SESSION_DAYS = 90;
const RESET_MINUTES = 60;
const CONFIRM_DAYS = 7;
const FEEDBACK_MAX = 4000;
const ALERTS_PER_HOUR = 5;
const EMAIL =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  // Logged, not alerted: Neon closes idle connections as a matter of course, and the pool reconnects.
  const store = await Store.open(opts.database, (err) => app.log.error(err, 'database connection dropped'));
  const throttle = new Throttle(10, 15 * 60_000);
  // Reset emails: a few to any one address, so nobody can flood someone's inbox, and a few more
  // from any one address on the internet.
  const resetsPerEmail = new Throttle(3, 60 * 60_000);
  const resetsPerIp = new Throttle(10, 60 * 60_000);
  // Feedback: a few messages an hour from one address, and a cap a day in all, so nobody can use
  // up Resend's 100 emails a day that reset links need too.
  const feedbackPerIp = new Throttle(5, 60 * 60_000);
  const feedbackPerDay = new Throttle(30, 24 * 60 * 60_000);
  // Sign-ups: enough an hour for a class signing up on the school's Wi-Fi, too few for a script
  // to fill the free database.
  const signupsPerIp = new Throttle(20, 60 * 60_000);
  // Links to confirm an address: a few an hour to one profile, and a cap a day in all, as for feedback.
  const linksPerUser = new Throttle(3, 60 * 60_000);
  const linksPerDay = new Throttle(50, 24 * 60 * 60_000);
  // Error alerts: a few an hour, so a failure on every request can't flood the owner's inbox or
  // use up the day's emails.
  const alertsPerHour = new Throttle(ALERTS_PER_HOUR, 60 * 60_000);
  app.addHook('onClose', async () => store.close());

  /** Logs a failure the pilot didn't cause, and emails the owner about it. */
  const failed = (err: unknown, what: string) => {
    app.log.error(err, what);
    const { sendMail, alertTo } = opts;
    if (!sendMail || !alertTo || alertsPerHour.blocked('all')) return;
    alertsPerHour.fail('all');
    void sendMail(alertMail(alertTo, what, err, new Date(), ALERTS_PER_HOUR)).catch((e: unknown) => app.log.error(e, 'error alert not sent'));
  };

  // A request the server couldn't handle: the pilot gets a plain sentence rather than the error,
  // and the owner gets an email. A request that was itself wrong (bad JSON, too big) says why.
  app.setErrorHandler(async (err: Error & { statusCode?: number }, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status < 500) return reply.code(status).send({ error: err.message });
    failed(err, `${req.method} ${req.url} failed`);
    return reply.code(500).send({ error: 'Something went wrong on our side. Try again in a few minutes.' });
  });

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

  const accountOf = async (userId: string): Promise<Account> => (await store.account(userId, Date.now()))!;

  /**
   * The signed-in pilot's password again, before a change that matters. Wrong guesses count
   * toward the same limit as signing in. False once it has replied with why not.
   */
  const passwordChecked = async (req: FastifyRequest, reply: FastifyReply, password: string): Promise<boolean> => {
    const key = `password|${req.user!.id}`;
    if (throttle.blocked(key)) {
      await reply.code(429).send({ error: 'Too many attempts. Try again in 15 minutes.' });
      return false;
    }
    const stored = await store.passwordHashFor(req.user!.id);
    if (!stored || !(await verifyPassword(password, stored))) {
      throttle.fail(key);
      await reply.code(401).send({ error: 'That password is incorrect.' });
      return false;
    }
    throttle.clear(key);
    return true;
  };

  const linksBlocked = (userId: string) => linksPerUser.blocked(userId) || linksPerDay.blocked('all');

  /**
   * Emails a link that confirms `email` for this profile: its own address, or one it is moving
   * to. In the fragment, like a reset link, so the token stays out of logs.
   */
  const sendEmailLink = async (user: User, email: string) => {
    const { sendMail, appUrl } = opts;
    if (!sendMail || !appUrl) throw new Error('Email is not set up.');
    linksPerUser.fail(user.id);
    linksPerDay.fail('all');
    const { token, hash } = newToken();
    await store.createEmailLink(user.id, email, hash, Date.now() + CONFIRM_DAYS * 86_400_000);
    const link = new URL(appUrl);
    link.hash = `confirm=${token}`;
    await sendMail(confirmMail(email, link.toString(), CONFIRM_DAYS, email !== user.email));
  };

  /** For a pilot asking for a link: false once it has replied with why one can't be sent. */
  const emailLinkSent = async (reply: FastifyReply, user: User, email: string): Promise<boolean> => {
    if (!opts.sendMail || !opts.appUrl) {
      await reply.code(503).send({ error: 'Sending email isn’t available yet.' });
      return false;
    }
    if (linksBlocked(user.id)) {
      await reply.code(429).send({ error: 'Too many emails sent. Try again in an hour.' });
      return false;
    }
    try {
      await sendEmailLink(user, email);
      return true;
    } catch (err) {
      failed(err, 'email link not sent');
      await reply.code(502).send({ error: 'The email couldn’t be sent. Try again in a few minutes.' });
      return false;
    }
  };

  // --- Accounts --------------------------------------------------------------

  // The profile works at once. The link to confirm the address is sent after replying, and only
  // matters for a password reset later; nothing waits for it.
  app.post('/api/auth/signup', async (req, reply) => {
    const body = bodyOf(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    if (!EMAIL.test(email) || email.length > 254) return reply.code(400).send({ error: 'Enter a valid email address.' });
    const problem = passwordProblem(password);
    if (problem) return reply.code(400).send({ error: problem });
    if (signupsPerIp.blocked(req.ip)) return reply.code(429).send({ error: 'Too many profiles created from this network. Try again in an hour.' });
    signupsPerIp.fail(req.ip);
    const user = await store.createUser(email, await hashPassword(password));
    if (!user) return reply.code(409).send({ error: 'An account with that email already exists. Sign in instead.' });
    await startSession(reply, user);
    if (opts.sendMail && opts.appUrl && !linksBlocked(user.id)) {
      void sendEmailLink(user, user.email).catch((err: unknown) => failed(err, 'confirmation email not sent'));
    }
    return { user: { email: user.email, confirmed: false, pendingEmail: null } satisfies Account };
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
    return { user: await accountOf(found.id) };
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
    })().catch((err: unknown) => failed(err, 'password reset email not sent'));
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
    return { user: await accountOf(user.id) };
  });

  // Opened from an emailed link, on whatever browser the email app picks: no session needed.
  app.post('/api/auth/confirm', async (req, reply) => {
    const key = `confirm|${req.ip}`;
    if (throttle.blocked(key)) return reply.code(429).send({ error: 'Too many attempts. Try again in 15 minutes.' });
    const result = await store.spendEmailLink(hashToken(String(bodyOf(req).token ?? '')), Date.now());
    if (result === null) {
      throttle.fail(key);
      return reply.code(400).send({ error: 'This link has expired or has already been used. Send a new one from your profile.' });
    }
    if (result === 'taken') {
      return reply.code(409).send({ error: 'Another profile has started using that email since, so your profile keeps its old one.' });
    }
    return result;
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
    return { user: await accountOf(req.user!.id) };
  });

  app.delete('/api/account', { preHandler: requireUser }, async (req, reply) => {
    if (!(await passwordChecked(req, reply, String(bodyOf(req).password ?? '')))) return reply;
    await store.deleteUser(req.user!.id);
    reply.clearCookie(COOKIE, { path: '/' });
    return reply.code(204).send();
  });

  // Sends the link to confirm the profile's own address again.
  app.post('/api/account/confirm', { preHandler: requireUser }, async (req, reply) => {
    if (req.user!.confirmed) return reply.code(400).send({ error: 'Your email is already confirmed.' });
    if (!(await emailLinkSent(reply, req.user!, req.user!.email))) return reply;
    return reply.code(204).send();
  });

  // The new address takes over only once its link is opened, so a typo can't lock anyone out.
  app.post('/api/account/email', { preHandler: requireUser }, async (req, reply) => {
    const body = bodyOf(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) return reply.code(400).send({ error: 'Enter a valid email address.' });
    if (email === req.user!.email) return reply.code(400).send({ error: 'That’s already your email.' });
    if (!(await passwordChecked(req, reply, String(body.password ?? '')))) return reply;
    if (await store.findUserByEmail(email)) return reply.code(409).send({ error: 'Another profile already uses that email.' });
    if (!(await emailLinkSent(reply, req.user!, email))) return reply;
    return { user: await accountOf(req.user!.id) };
  });

  app.delete('/api/account/email', { preHandler: requireUser }, async (req) => {
    await store.cancelEmailChange(req.user!.id);
    return { user: await accountOf(req.user!.id) };
  });

  // Signed in here still; signed out everywhere else, as after a reset.
  app.post('/api/account/password', { preHandler: requireUser }, async (req, reply) => {
    const body = bodyOf(req);
    const next = String(body.newPassword ?? '');
    const problem = passwordProblem(next);
    if (problem) return reply.code(400).send({ error: problem });
    if (!(await passwordChecked(req, reply, String(body.password ?? '')))) return reply;
    await store.setPassword(req.user!.id, await hashPassword(next), hashToken(req.cookies[COOKIE]!));
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

  // --- Feedback --------------------------------------------------------------

  // Emailed to the owner, with the pilot's address to reply to when there is one, and kept nowhere
  // else. Signed in, it's the profile's address; otherwise the pilot may type one. Sent before
  // replying, so a message that didn't go says so.
  app.post('/api/feedback', async (req, reply) => {
    const { sendMail, feedbackTo } = opts;
    if (!sendMail || !feedbackTo) return reply.code(503).send({ error: 'Sending feedback isn’t available yet.' });
    const body = bodyOf(req);
    const message = String(body.message ?? '').trim();
    if (!message) return reply.code(400).send({ error: 'Write a message first.' });
    if (message.length > FEEDBACK_MAX) return reply.code(400).send({ error: 'That message is too long. Keep it under 4,000 characters.' });
    const from = req.user?.email ?? (String(body.email ?? '').trim().toLowerCase() || null);
    if (from !== null && (!EMAIL.test(from) || from.length > 254)) {
      return reply.code(400).send({ error: 'Enter a valid email address, or leave it empty.' });
    }
    if (feedbackPerIp.blocked(req.ip) || feedbackPerDay.blocked('all')) {
      return reply.code(429).send({ error: 'Too many messages sent. Try again later.' });
    }
    feedbackPerIp.fail(req.ip);
    feedbackPerDay.fail('all');
    const browser = String(req.headers['user-agent'] ?? '').slice(0, 300);
    try {
      await sendMail(feedbackMail(feedbackTo, { message, from, signedIn: req.user !== null, browser }));
    } catch (err) {
      failed(err, 'feedback email not sent');
      return reply.code(502).send({ error: 'Your message couldn’t be sent. Try again in a few minutes.' });
    }
    return reply.code(204).send();
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
