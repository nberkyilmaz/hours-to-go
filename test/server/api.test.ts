// @vitest-environment node
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../server/app';
import type { Mail } from '../../server/mail';
import { blankEntry } from '../../src/model/entry';

// Every test runs on PGlite. Production's database goes through `pg` instead, so when
// TEST_DATABASE_URL names a Postgres server (CI provides one) they all run there too,
// on tables dropped before each test.
const DATABASES = [
  { name: 'PGlite', url: 'memory://' },
  ...(process.env.TEST_DATABASE_URL ? [{ name: 'a Postgres server', url: process.env.TEST_DATABASE_URL }] : []),
];

async function emptied(url: string): Promise<string> {
  if (url === 'memory://') return url;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('drop table if exists password_resets, sessions, entries, profiles, users');
  } finally {
    await client.end();
  }
  return url;
}

let app: FastifyInstance;
/** Emails the app sent, instead of sending them. */
let sent: Mail[] = [];
const APP_URL = 'https://nberkyilmaz.test/hours-to-go/';
const OWNER = 'owner@example.test';

async function signUp(email = 'student@example.com', password = 'correct horse') {
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password } });
  const cookie = res.cookies.find((c) => c.name === 'htg_session');
  return { res, cookies: cookie ? { htg_session: cookie.value } : {} };
}

const anEntry = () => ({ ...blankEntry(false, '2026-10-01'), seDayPic: 90, xcDayPic: 90, solo: true });
const DAY = 86_400_000;

describe.each(DATABASES)('on $name', ({ url }) => {
  beforeEach(async () => {
    sent = [];
    app = await buildApp({
      database: await emptied(url),
      secureCookies: false,
      appUrl: APP_URL,
      feedbackTo: OWNER,
      sendMail: async (mail) => {
        sent.push(mail);
      },
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  describe('accounts', () => {
    it('signs up, sets an HttpOnly session cookie, and knows who you are', async () => {
      const { res, cookies } = await signUp('Student@Example.com ');
      expect(res.statusCode).toBe(200);
      const cookie = res.cookies.find((c) => c.name === 'htg_session');
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('Lax');
      const me = await app.inject({ method: 'GET', url: '/api/me', cookies });
      expect(me.json()).toEqual({ user: { email: 'student@example.com' } });
    });

    it('refuses a duplicate email, a short password and a bad email', async () => {
      await signUp();
      expect((await signUp()).res.statusCode).toBe(409);
      expect((await signUp('x@example.com', 'short')).res.statusCode).toBe(400);
      expect((await signUp('not-an-email', 'long enough')).res.statusCode).toBe(400);
    });

    it('signs in with the right password only', async () => {
      await signUp();
      const bad = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'student@example.com', password: 'wrong password' } });
      expect(bad.statusCode).toBe(401);
      const good = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'STUDENT@example.com', password: 'correct horse' } });
      expect(good.statusCode).toBe(200);
    });

    it('slows down repeated failed sign-ins', async () => {
      await signUp();
      let last = 0;
      for (let i = 0; i < 11; i++) {
        last = (await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'student@example.com', password: `nope ${i}` } })).statusCode;
      }
      expect(last).toBe(429);
    });

    it('signs out by ending the session on the server', async () => {
      const { cookies } = await signUp();
      await app.inject({ method: 'POST', url: '/api/auth/logout', cookies });
      expect((await app.inject({ method: 'GET', url: '/api/me', cookies })).statusCode).toBe(401);
    });

    it('deletes the account and everything in it, with the password', async () => {
      const { cookies } = await signUp();
      const e = anEntry();
      await app.inject({ method: 'PUT', url: `/api/entries/${e.id}`, payload: e, cookies });
      expect((await app.inject({ method: 'DELETE', url: '/api/account', payload: { password: 'nope nope' }, cookies })).statusCode).toBe(401);
      expect((await app.inject({ method: 'DELETE', url: '/api/account', payload: { password: 'correct horse' }, cookies })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/api/me', cookies })).statusCode).toBe(401);
      expect((await signUp()).res.statusCode).toBe(200);
    });
  });

  describe('logbook', () => {
    it('keeps entries and profile per pilot', async () => {
      const a = await signUp('a@example.com');
      const b = await signUp('b@example.com');
      const e = anEntry();
      expect((await app.inject({ method: 'PUT', url: `/api/entries/${e.id}`, payload: e, cookies: a.cookies })).statusCode).toBe(200);
      await app.inject({ method: 'PUT', url: '/api/profile', payload: { medical: 'cat1', held: { ppl: { date: '2025-05-01' } }, focus: 'ifr3' }, cookies: a.cookies });

      const mine = (await app.inject({ method: 'GET', url: '/api/logbook', cookies: a.cookies })).json();
      expect(mine.entries).toHaveLength(1);
      expect(mine.entries[0].xcDayPic).toBe(90);
      expect(mine.profile.focus).toBe('ifr3');
      expect(mine.profile.held.ppl.date).toBe('2025-05-01');

      const theirs = (await app.inject({ method: 'GET', url: '/api/logbook', cookies: b.cookies })).json();
      expect(theirs.entries).toHaveLength(0);
      // B can't delete A's flight.
      await app.inject({ method: 'DELETE', url: `/api/entries/${e.id}`, cookies: b.cookies });
      expect((await app.inject({ method: 'GET', url: '/api/logbook', cookies: a.cookies })).json().entries).toHaveLength(1);
    });

    it('needs a session', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/logbook' })).statusCode).toBe(401);
      const e = anEntry();
      expect((await app.inject({ method: 'PUT', url: `/api/entries/${e.id}`, payload: e })).statusCode).toBe(401);
    });

    it('rejects an entry that does not add up', async () => {
      const { cookies } = await signUp();
      const e = { ...anEntry(), xcDayPic: 500 };
      const res = await app.inject({ method: 'PUT', url: `/api/entries/${e.id}`, payload: e, cookies });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toMatch(/More than the day PIC time/);
    });

    it('edits and deletes an entry', async () => {
      const { cookies } = await signUp();
      const e = anEntry();
      await app.inject({ method: 'PUT', url: `/api/entries/${e.id}`, payload: e, cookies });
      await app.inject({ method: 'PUT', url: `/api/entries/${e.id}`, payload: { ...e, remarks: 'edited' }, cookies });
      let book = (await app.inject({ method: 'GET', url: '/api/logbook', cookies })).json();
      expect(book.entries.map((x: { remarks: string }) => x.remarks)).toEqual(['edited']);
      await app.inject({ method: 'DELETE', url: `/api/entries/${e.id}`, cookies });
      book = (await app.inject({ method: 'GET', url: '/api/logbook', cookies })).json();
      expect(book.entries).toHaveLength(0);
    });

    it('merges a guest logbook in without duplicating or overwriting', async () => {
      const { cookies } = await signUp();
      const kept = { ...anEntry(), remarks: 'in the account' };
      await app.inject({ method: 'PUT', url: `/api/entries/${kept.id}`, payload: kept, cookies });
      const fresh = anEntry();
      const res = await app.inject({
        method: 'POST',
        url: '/api/logbook/merge',
        payload: { version: 2, entries: [{ ...kept, remarks: 'from the phone' }, fresh], profile: { medical: 'cat3' } },
        cookies,
      });
      const book = res.json();
      expect(book.entries).toHaveLength(2);
      expect(book.entries.find((x: { id: string }) => x.id === kept.id).remarks).toBe('in the account');
      expect(book.profile.medical).toBe('cat3');
    });
  });

  describe('staying signed in', () => {
    it('starts the 90 days again each time the app opens', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { cookies } = await signUp();
      const me = () => app.inject({ method: 'GET', url: '/api/me', cookies });

      vi.setSystemTime(Date.now() + 80 * DAY);
      const renewed = (await me()).cookies.find((c) => c.name === 'htg_session');
      // The same session, its cookie set again for the full 90 days.
      expect(renewed?.value).toBe(cookies.htg_session);
      expect(renewed?.maxAge).toBe(90 * 86_400);

      // 160 days after signing up, but only 80 since the app was last opened.
      vi.setSystemTime(Date.now() + 80 * DAY);
      expect((await me()).statusCode).toBe(200);

      vi.setSystemTime(Date.now() + 91 * DAY);
      expect((await me()).statusCode).toBe(401);
    });

    it('answers the health check once the database answers', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });
  });

  describe('a forgotten password', () => {
    const forgot = (email: string) => app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email } });
    const reset = (token: string, password: string) =>
      app.inject({ method: 'POST', url: '/api/auth/reset', payload: { token, password } });
    const login = (password: string) =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'student@example.com', password } });
    /** The token from the emailed link, which carries it after `#reset=`. */
    const tokenFrom = (mail: Mail) => {
      const link = /https:\/\/\S+#reset=([\w-]+)/.exec(mail.text);
      expect(link?.[0].startsWith(APP_URL)).toBe(true);
      return link![1]!;
    };

    it('emails a link, which sets a new password and signs in', async () => {
      await signUp();
      expect((await forgot(' Student@Example.com')).statusCode).toBe(204);
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.to).toBe('student@example.com');
      expect(sent[0]!.html).toContain(`href="${APP_URL}#reset=`);

      const res = await reset(tokenFrom(sent[0]!), 'a new long password');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ user: { email: 'student@example.com' } });
      const cookies = { htg_session: res.cookies.find((c) => c.name === 'htg_session')!.value };
      expect((await app.inject({ method: 'GET', url: '/api/me', cookies })).statusCode).toBe(200);
      expect((await login('correct horse')).statusCode).toBe(401);
      expect((await login('a new long password')).statusCode).toBe(200);
    });

    it('answers the same for an email with no profile, and sends nothing', async () => {
      await signUp();
      expect((await forgot('nobody@example.com')).statusCode).toBe(204);
      expect((await forgot('student@example.com')).statusCode).toBe(204);
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.to).toBe('student@example.com');
    });

    it('works once, and signs out every other device', async () => {
      const { cookies: before } = await signUp();
      await forgot('student@example.com');
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      const token = tokenFrom(sent[0]!);
      expect((await reset(token, 'a new long password')).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/me', cookies: before })).statusCode).toBe(401);
      const again = await reset(token, 'another long password');
      expect(again.statusCode).toBe(400);
      expect(again.json().error).toMatch(/expired or has already been used/);
    });

    it('stops working after an hour, when a new link can be asked for', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      await signUp();
      await forgot('student@example.com');
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      vi.setSystemTime(Date.now() + 61 * 60_000);
      expect((await reset(tokenFrom(sent[0]!), 'a new long password')).statusCode).toBe(400);
      await forgot('student@example.com');
      await vi.waitFor(() => expect(sent).toHaveLength(2));
      expect((await reset(tokenFrom(sent[1]!), 'a new long password')).statusCode).toBe(200);
    });

    it('refuses a short new password and a made-up link', async () => {
      expect((await reset('made-up', 'short')).statusCode).toBe(400);
      expect((await reset('made-up', 'long enough password')).statusCode).toBe(400);
    });

    it('sends at most three emails an hour to one address', async () => {
      await signUp();
      for (let i = 0; i < 3; i++) expect((await forgot('student@example.com')).statusCode).toBe(204);
      expect((await forgot('student@example.com')).statusCode).toBe(429);
      await vi.waitFor(() => expect(sent).toHaveLength(3));
    });
  });

  describe('feedback', () => {
    const feedback = (payload: object, cookies: Record<string, string> = {}) =>
      app.inject({ method: 'POST', url: '/api/feedback', payload, cookies, headers: { 'user-agent': 'TestBrowser/1.0' } });

    it('emails the owner, with a guest’s address to reply to', async () => {
      const res = await feedback({ message: '  The <b>night</b> rating & IFR\nSecond line ', email: ' Pilot@Example.com' });
      expect(res.statusCode).toBe(204);
      expect(sent).toHaveLength(1);
      const mail = sent[0]!;
      expect(mail.to).toBe(OWNER);
      expect(mail.replyTo).toBe('pilot@example.com');
      expect(mail.subject).toBe('Feedback: The <b>night</b> rating & IFR');
      expect(mail.text).toContain('The <b>night</b> rating & IFR\nSecond line\n');
      expect(mail.text).toContain('pilot@example.com (not signed in)');
      expect(mail.text).toContain('TestBrowser/1.0');
      // The pilot's words are text in the HTML, never markup.
      expect(mail.html).toContain('The &lt;b&gt;night&lt;/b&gt; rating &amp; IFR');
      expect(mail.html).not.toContain('<b>');
    });

    it('sends without an address, and then has no one to reply to', async () => {
      expect((await feedback({ message: 'Hello', email: '' })).statusCode).toBe(204);
      expect(sent[0]!.replyTo).toBeUndefined();
      expect(sent[0]!.text).toContain('No email given');
    });

    it('replies to the profile’s address when signed in, whatever was typed', async () => {
      const { cookies } = await signUp();
      expect((await feedback({ message: 'Hello', email: 'someone@else.com' }, cookies)).statusCode).toBe(204);
      expect(sent[0]!.replyTo).toBe('student@example.com');
      expect(sent[0]!.text).toContain('student@example.com (signed in)');
    });

    it('refuses an empty or very long message and a bad address, and sends nothing', async () => {
      expect((await feedback({ message: '   ' })).statusCode).toBe(400);
      expect((await feedback({ message: 'x'.repeat(4001) })).statusCode).toBe(400);
      expect((await feedback({ message: 'Hello', email: 'not-an-email' })).statusCode).toBe(400);
      expect(sent).toHaveLength(0);
    });

    it('takes at most five messages an hour from one address', async () => {
      for (let i = 0; i < 5; i++) expect((await feedback({ message: `Message ${i}` })).statusCode).toBe(204);
      expect((await feedback({ message: 'One too many' })).statusCode).toBe(429);
      expect(sent).toHaveLength(5);
    });
  });
});

describe('a server that can’t send email', () => {
  it('says resetting and feedback are unavailable rather than pretending to send', async () => {
    const api = await buildApp({ database: 'memory://', secureCookies: false });
    try {
      const res = await api.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'student@example.com' } });
      expect(res.statusCode).toBe(503);
      const feedback = await api.inject({ method: 'POST', url: '/api/feedback', payload: { message: 'Hello' } });
      expect(feedback.statusCode).toBe(503);
    } finally {
      await api.close();
    }
  });

  it('says when a message couldn’t be sent', async () => {
    const api = await buildApp({
      database: 'memory://',
      secureCookies: false,
      feedbackTo: OWNER,
      sendMail: async () => {
        throw new Error('Resend answered 500');
      },
    });
    try {
      const res = await api.inject({ method: 'POST', url: '/api/feedback', payload: { message: 'Hello' } });
      expect(res.statusCode).toBe(502);
      expect(res.json().error).toMatch(/couldn’t be sent/);
    } finally {
      await api.close();
    }
  });
});

describe('an API on its own subdomain', () => {
  it('lets the published page call it with the cookie, and no other site', async () => {
    const api = await buildApp({ database: 'memory://', secureCookies: true, allowedOrigins: ['https://nberkyilmaz.com'] });
    const preflight = (origin: string) =>
      api.inject({
        method: 'OPTIONS',
        url: '/api/entries/x',
        headers: { origin, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type' },
      });
    try {
      const page = await preflight('https://nberkyilmaz.com');
      expect(page.headers['access-control-allow-origin']).toBe('https://nberkyilmaz.com');
      expect(page.headers['access-control-allow-credentials']).toBe('true');
      expect(page.headers['access-control-allow-methods']).toContain('PUT');
      const other = await preflight('https://example.com');
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await api.close();
    }
  });
});
