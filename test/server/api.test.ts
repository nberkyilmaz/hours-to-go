// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../server/app';
import { Throttle, hashPassword } from '../../server/auth';
import type { Store } from '../../server/db';
import type { Mail } from '../../server/mail';
import { sendReminders } from '../../server/reminders';
import { addDays, blankEntry, today } from '../../src/model/entry';
import { blankProfile } from '../../src/model/profile';

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
    await client.query('drop table if exists migrations, share_links, reminders_sent, email_links, password_resets, sessions, entries, profiles, users');
  } finally {
    await client.end();
  }
  return url;
}

let app: FastifyInstance;
/** Emails the app sent, instead of sending them. */
let sent: Mail[] = [];
let mailFails = false;
const APP_URL = 'https://nberkyilmaz.test/hours-to-go/';
const OWNER = 'owner@example.test';

/**
 * Signs up, and waits for the email that confirms the address. That email is handed back rather
 * than left in `sent`, so a test counts only the emails it caused itself.
 */
async function signUp(email = 'student@example.com', password = 'correct horse') {
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password } });
  const cookie = res.cookies.find((c) => c.name === 'htg_session');
  let confirmation: Mail | undefined;
  if (res.statusCode === 200) {
    await vi.waitFor(() => {
      confirmation = sent.find((m) => m.subject === 'Confirm your email for Hours to Go');
      expect(confirmation).toBeDefined();
    });
    sent = sent.filter((m) => m !== confirmation);
  }
  return { res, cookies: cookie ? { htg_session: cookie.value } : {}, confirmation: confirmation! };
}

/** The token from an emailed link, which carries it in the fragment after `#reset=`, `#confirm=` or `#stop=`. */
/** The token at the end of a read-only link. */
const shareToken = (link: string) => new URL(link).hash.replace('#share=', '');

function tokenIn(mail: Mail, kind: 'reset' | 'confirm' | 'stop'): string {
  const link = new RegExp(`https://\\S+#${kind}=([\\w-]+)`).exec(mail.text);
  expect(link?.[0].startsWith(APP_URL)).toBe(true);
  return link![1]!;
}

const anEntry = () => ({ ...blankEntry(false, '2026-10-01'), seDayPic: 90, xcDayPic: 90, solo: true });
const DAY = 86_400_000;

describe.each(DATABASES)('on $name', ({ url }) => {
  beforeEach(async () => {
    sent = [];
    mailFails = false;
    app = await buildApp({
      database: await emptied(url),
      secureCookies: false,
      appUrl: APP_URL,
      feedbackTo: OWNER,
      alertTo: OWNER,
      remindersKey: 'the-key',
      sendMail: async (mail) => {
        if (mailFails) throw new Error('Resend is down');
        sent.push(mail);
      },
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  describe('a hostile request', () => {
    const login = (email: string, password: string, headers: Record<string, string> = {}) =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, headers });

    it('can’t tie up the server with a very long address', async () => {
      const email = `a@${'.'.repeat(40_000)}@`;
      const started = Date.now();
      const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email, password: 'correct horse' } });
      expect(res.statusCode).toBe(400);
      expect(Date.now() - started).toBeLessThan(500);
    });

    it('can’t send a huge body, except a whole logbook', async () => {
      const big = 'x'.repeat(70 * 1024);
      expect((await login(big, 'correct horse')).statusCode).toBe(413);
      const { cookies } = await signUp();
      const entries = Array.from({ length: 400 }, (_, i) => ({ ...anEntry(), id: `f${i}`, remarks: 'r'.repeat(190) }));
      const merged = await app.inject({ method: 'POST', url: '/api/logbook/merge', cookies, payload: { version: 2, entries, profile: blankProfile() } });
      expect(merged.statusCode).toBe(200);
      expect(merged.json().entries).toHaveLength(400);
    });

    it('is refused for an address too long to be anyone’s, without counting it', async () => {
      const res = await login(`${'a'.repeat(300)}@example.com`, 'nope nope');
      expect(res.statusCode).toBe(401);
    });

    it('can’t dodge the limit on wrong passwords by claiming another network', async () => {
      await signUp();
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await login('student@example.com', 'wrong password', { 'x-forwarded-for': `203.0.113.${i}` })).statusCode;
      expect(last).toBe(429);
    });

    it('counts each network Cloudflare names on its own', async () => {
      await signUp();
      for (let i = 0; i < 10; i++) await login('student@example.com', 'wrong password', { 'cf-connecting-ip': '198.51.100.1' });
      expect((await login('student@example.com', 'wrong password', { 'cf-connecting-ip': '198.51.100.1' })).statusCode).toBe(429);
      expect((await login('student@example.com', 'wrong password', { 'cf-connecting-ip': '198.51.100.2' })).statusCode).toBe(401);
    });

    it('stops guessing one profile’s password from many networks, until the pilot resets it', async () => {
      await signUp();
      for (let i = 0; i < 50; i++) await login('student@example.com', 'wrong password', { 'cf-connecting-ip': `198.51.100.${i}` });
      expect((await login('student@example.com', 'correct horse', { 'cf-connecting-ip': '192.0.2.1' })).statusCode).toBe(429);
      await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'student@example.com' } });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      await app.inject({ method: 'POST', url: '/api/auth/reset', payload: { token: tokenIn(sent[0]!, 'reset'), password: 'a whole new password' } });
      expect((await login('student@example.com', 'a whole new password', { 'cf-connecting-ip': '192.0.2.1' })).statusCode).toBe(200);
    }, 30_000);

    const askToMove = async (cookies: Record<string, string>) => {
      await app.inject({ method: 'POST', url: '/api/account/email', cookies, payload: { email: 'intruder@example.com', password: 'correct horse' } });
      await vi.waitFor(() => expect(sent.some((m) => m.to === 'intruder@example.com')).toBe(true));
      return tokenIn(sent.find((m) => m.to === 'intruder@example.com')!, 'confirm');
    };
    const open = (token: string) => app.inject({ method: 'POST', url: '/api/auth/confirm', payload: { token } });

    it('can’t carry a profile off with a change of address after the password is reset', async () => {
      const { cookies } = await signUp();
      const token = await askToMove(cookies);
      await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'student@example.com' } });
      await vi.waitFor(() => expect(sent.some((m) => m.to === 'student@example.com')).toBe(true));
      await app.inject({ method: 'POST', url: '/api/auth/reset', payload: { token: tokenIn(sent.find((m) => m.to === 'student@example.com')!, 'reset'), password: 'a whole new password' } });
      expect((await open(token)).statusCode).toBe(400);
      expect((await login('student@example.com', 'a whole new password')).statusCode).toBe(200);
    });

    it('can’t either after the pilot changes the password', async () => {
      const { cookies } = await signUp();
      const token = await askToMove(cookies);
      await app.inject({ method: 'POST', url: '/api/account/password', cookies, payload: { password: 'correct horse', newPassword: 'a whole new password' } });
      expect((await open(token)).statusCode).toBe(400);
    });

    it('tells the old address when a profile moves, in the pilot’s language, without saying so to the page', async () => {
      const { cookies } = await signUp();
      const token = await askToMove(cookies);
      sent = [];
      const res = await app.inject({ method: 'POST', url: '/api/auth/confirm', payload: { token, lang: 'fr' } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ email: 'intruder@example.com', changed: true });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.to).toBe('student@example.com');
      expect(sent[0]!.subject).toBe('L’adresse courriel de votre profil Hours to Go a été changée');
      expect(sent[0]!.text).toContain('intruder@example.com');
      expect(sent[0]!.text).toContain(OWNER);
    });

    it('doesn’t tell anyone when an address is only being confirmed', async () => {
      const { confirmation } = await signUp();
      await open(tokenIn(confirmation, 'confirm'));
      await new Promise((r) => setTimeout(r, 20));
      expect(sent).toHaveLength(0);
    });

    it('can’t save a date that isn’t on the calendar', async () => {
      const { cookies } = await signUp();
      const profile = { ...blankProfile(), medical: 'cat3', medicalUntil: '2026-02-30', milestones: { 'letter-ppaer': { date: '2026-13-45' } } };
      const res = await app.inject({ method: 'PUT', url: '/api/profile', cookies, payload: profile });
      expect(res.json().medicalUntil).toBe('');
      expect(res.json().milestones['letter-ppaer'].date).toBe('');
      expect((await app.inject({ method: 'PUT', url: '/api/entries/bad', cookies, payload: { ...anEntry(), id: 'bad', date: '2026-02-30' } })).statusCode).toBe(400);
    });
  });

  describe('emails in French', () => {
    it('confirms a sign-up in the language of the app', async () => {
      await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'eleve@example.com', password: 'correct horse', lang: 'fr' } });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.subject).toBe('Confirmez votre courriel pour Hours to Go');
      expect(sent[0]!.html).toContain('Confirmer mon courriel');
    });

    it('sends a reset link in the language of the app', async () => {
      await signUp();
      await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'student@example.com', lang: 'fr' } });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.subject).toBe('Réinitialisez votre mot de passe Hours to Go');
    });

    it('stays in English unless told otherwise', async () => {
      await signUp();
      await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'student@example.com' } });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.subject).toBe('Reset your Hours to Go password');
    });
  });

  describe('a link for an instructor', () => {
    const create = (cookies: Record<string, string>, name = 'Sam') => app.inject({ method: 'POST', url: '/api/account/share', cookies, payload: { name } });
    const open = (token: string) => app.inject({ method: 'POST', url: '/api/shared', payload: { token } });
    const log = (cookies: Record<string, string>) =>
      app.inject({ method: 'PUT', url: '/api/entries/flight-1', cookies, payload: { ...anEntry(), id: 'flight-1', registration: 'C-GSECRET', remarks: 'A private remark' } });

    it('needs a signed-in pilot to make one', async () => {
      expect((await app.inject({ method: 'POST', url: '/api/account/share', payload: {} })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/account/share' })).statusCode).toBe(401);
    });

    it('opens with no sign-in, and shows figures, not the logbook', async () => {
      const { cookies } = await signUp();
      await log(cookies);
      const made = (await create(cookies)).json();
      expect(made.link.startsWith(`${APP_URL}#share=`)).toBe(true);
      const res = await open(shareToken(made.link));
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.json()).toMatchObject({ name: 'Sam', goal: expect.any(String), expiresAt: made.share.expiresAt });
      expect(res.json().percent).toBeGreaterThan(0);
      for (const secret of ['C-GSECRET', 'A private remark', 'student@example.com']) expect(res.body).not.toContain(secret);
    });

    it('says what is out, without the link itself', async () => {
      const { cookies } = await signUp();
      expect((await app.inject({ method: 'GET', url: '/api/account/share', cookies })).json()).toEqual({ share: null });
      const made = (await create(cookies)).json();
      const res = await app.inject({ method: 'GET', url: '/api/account/share', cookies });
      expect(res.json()).toEqual({ share: made.share });
      expect(res.body).not.toContain(shareToken(made.link));
    });

    it('stops working when replaced', async () => {
      const { cookies } = await signUp();
      const first = (await create(cookies)).json();
      const second = (await create(cookies, 'Sam B')).json();
      expect((await open(shareToken(first.link))).statusCode).toBe(404);
      expect((await open(shareToken(second.link))).json().name).toBe('Sam B');
    });

    it('stops working when the pilot stops it', async () => {
      const { cookies } = await signUp();
      const made = (await create(cookies)).json();
      expect((await app.inject({ method: 'DELETE', url: '/api/account/share', cookies })).statusCode).toBe(204);
      expect((await open(shareToken(made.link))).statusCode).toBe(404);
    });

    it('stops working after 30 days', async () => {
      const { cookies } = await signUp();
      const made = (await create(cookies)).json();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 29 * DAY);
      expect((await open(shareToken(made.link))).statusCode).toBe(200);
      vi.setSystemTime(Date.now() + 2 * DAY);
      expect((await open(shareToken(made.link))).statusCode).toBe(404);
    });

    it('goes when the profile does', async () => {
      const { cookies } = await signUp();
      const made = (await create(cookies)).json();
      await app.inject({ method: 'DELETE', url: '/api/account', cookies, payload: { password: 'correct horse' } });
      expect((await open(shareToken(made.link))).statusCode).toBe(404);
    });

    it('turns away anyone who keeps guessing', async () => {
      for (let i = 0; i < 30; i++) expect((await open(`wrong-${i}`)).statusCode).toBe(404);
      expect((await open('wrong-again')).statusCode).toBe(429);
    });
  });

  describe('reminders', () => {
    const me = (cookies: Record<string, string>) => app.inject({ method: 'GET', url: '/api/me', cookies });
    const run = (key = 'the-key') => app.inject({ method: 'POST', url: '/api/reminders/run', headers: { authorization: `Bearer ${key}` } });
    const turn = (cookies: Record<string, string>, on: boolean) => app.inject({ method: 'PUT', url: '/api/account/reminders', cookies, payload: { on } });
    const medicalIn = (cookies: Record<string, string>, days: number) =>
      app.inject({ method: 'PUT', url: '/api/profile', cookies, payload: { ...blankProfile(), medical: 'cat3', medicalUntil: addDays(today(), days) } });
    const confirmedPilot = async (email = 'student@example.com') => {
      const { cookies, confirmation } = await signUp(email);
      await app.inject({ method: 'POST', url: '/api/auth/confirm', payload: { token: tokenIn(confirmation, 'confirm') } });
      return cookies;
    };

    it('only runs with the key', async () => {
      expect((await run('wrong')).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/reminders/run' })).statusCode).toBe(401);
      expect((await run()).json()).toEqual({ checked: 0, sent: 0, failed: 0, waiting: 0 });
    });

    it('waits for a confirmed email before turning on', async () => {
      const { cookies } = await signUp();
      const res = await turn(cookies, true);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('Confirm your email');
    });

    it('sends what is coming up once, and not again the next day', async () => {
      const cookies = await confirmedPilot();
      expect((await turn(cookies, true)).json().user.reminders).toBe(true);
      await medicalIn(cookies, 20);
      expect((await run()).json()).toEqual({ checked: 1, sent: 1, failed: 0, waiting: 0 });
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe('student@example.com');
      expect(sent[0]!.subject).toBe('Your medical certificate runs out in 20 days');
      expect((await run()).json().sent).toBe(0);
      expect(sent).toHaveLength(1);
    });

    it('sends nothing to a pilot who didn’t ask', async () => {
      await medicalIn(await confirmedPilot(), 20);
      expect((await run()).json()).toEqual({ checked: 0, sent: 0, failed: 0, waiting: 0 });
      expect(sent).toEqual([]);
    });

    it('stops from the link in the email, signed out', async () => {
      const cookies = await confirmedPilot();
      await turn(cookies, true);
      await medicalIn(cookies, 20);
      await run();
      const res = await app.inject({ method: 'POST', url: '/api/reminders/off', payload: { token: tokenIn(sent[0]!, 'stop') } });
      expect(res.statusCode).toBe(204);
      expect((await me(cookies)).json().user.reminders).toBe(false);
      await medicalIn(cookies, 19);
      expect((await run()).json().checked).toBe(0);
    });

    it('writes to a pilot in the language they turned them on in', async () => {
      const cookies = await confirmedPilot();
      await app.inject({ method: 'PUT', url: '/api/account/reminders', cookies, payload: { on: true, lang: 'fr' } });
      await medicalIn(cookies, 20);
      await run();
      expect(sent[0]!.subject).toBe('Votre certificat médical\u00a0: échéance dans 20 jours');
      expect(sent[0]!.text).toContain('Arrêter'.slice(0, 0) + 'Pour les arrêter');
      expect(sent[0]!.html).toContain('Arrêter ces rappels');
    });

    it('turns down a link it doesn’t know', async () => {
      expect((await app.inject({ method: 'POST', url: '/api/reminders/off', payload: { token: 'nope' } })).statusCode).toBe(400);
    });

    it('keeps the same link working after turning off and on again', async () => {
      const cookies = await confirmedPilot();
      await turn(cookies, true);
      await medicalIn(cookies, 20);
      await run();
      const first = tokenIn(sent[0]!, 'stop');
      await turn(cookies, false);
      await turn(cookies, true);
      await medicalIn(cookies, 19);
      await run();
      expect(tokenIn(sent[1]!, 'stop')).toBe(first);
    });

    it('tries again the next day when an email didn’t go', async () => {
      const cookies = await confirmedPilot();
      await turn(cookies, true);
      await medicalIn(cookies, 20);
      mailFails = true;
      expect((await run()).json()).toMatchObject({ sent: 0, failed: 1 });
      mailFails = false;
      expect((await run()).json()).toMatchObject({ sent: 1, failed: 0 });
    });
  });

  describe('accounts', () => {
    it('signs up, sets an HttpOnly session cookie, and knows who you are', async () => {
      const { res, cookies } = await signUp('Student@Example.com ');
      expect(res.statusCode).toBe(200);
      const cookie = res.cookies.find((c) => c.name === 'htg_session');
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('Lax');
      const me = await app.inject({ method: 'GET', url: '/api/me', cookies });
      expect(me.json()).toEqual({ user: { email: 'student@example.com', confirmed: false, pendingEmail: null, reminders: false } });
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
      const rates = { aircraft: 235, instructor: 92, sim: 135, tax: 13 };
      await app.inject({ method: 'PUT', url: '/api/profile', payload: { medical: 'cat1', held: { ppl: { date: '2025-05-01' } }, focus: 'ifr3', rates }, cookies: a.cookies });

      const mine = (await app.inject({ method: 'GET', url: '/api/logbook', cookies: a.cookies })).json();
      expect(mine.entries).toHaveLength(1);
      expect(mine.entries[0].xcDayPic).toBe(90);
      expect(mine.profile.focus).toBe('ifr3');
      expect(mine.profile.held.ppl.date).toBe('2025-05-01');
      expect(mine.profile.rates).toEqual(rates);

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
    const tokenFrom = (mail: Mail) => tokenIn(mail, 'reset');

    it('emails a link, which sets a new password and signs in', async () => {
      await signUp();
      expect((await forgot(' Student@Example.com')).statusCode).toBe(204);
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]!.to).toBe('student@example.com');
      expect(sent[0]!.html).toContain(`href="${APP_URL}#reset=`);

      const res = await reset(tokenFrom(sent[0]!), 'a new long password');
      expect(res.statusCode).toBe(200);
      // The link reached the inbox, so the address is confirmed too.
      expect(res.json()).toEqual({ user: { email: 'student@example.com', confirmed: true, pendingEmail: null, reminders: false } });
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

  describe('confirming an email', () => {
    const confirm = (token: string) => app.inject({ method: 'POST', url: '/api/auth/confirm', payload: { token } });
    const me = (cookies: Record<string, string>) => app.inject({ method: 'GET', url: '/api/me', cookies });
    const sendAgain = (cookies: Record<string, string>) => app.inject({ method: 'POST', url: '/api/account/confirm', cookies });

    it('emails a link on sign-up that confirms the address once, signed in or not', async () => {
      const { cookies, confirmation } = await signUp(' Student@Example.com');
      expect(confirmation.to).toBe('student@example.com');
      expect(confirmation.html).toContain(`href="${APP_URL}#confirm=`);
      expect((await me(cookies)).json().user.confirmed).toBe(false);

      const res = await confirm(tokenIn(confirmation, 'confirm'));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ email: 'student@example.com', changed: false });
      expect((await me(cookies)).json().user).toEqual({ email: 'student@example.com', confirmed: true, pendingEmail: null, reminders: false });
      expect((await confirm(tokenIn(confirmation, 'confirm'))).statusCode).toBe(400);
    });

    it('sends the link again, a few times an hour, until the address is confirmed', async () => {
      const { cookies } = await signUp();
      // The sign-up's own email is the first of three.
      expect((await sendAgain(cookies)).statusCode).toBe(204);
      expect((await sendAgain(cookies)).statusCode).toBe(204);
      expect((await sendAgain(cookies)).statusCode).toBe(429);
      expect(sent.map((m) => m.to)).toEqual(['student@example.com', 'student@example.com']);

      expect((await confirm(tokenIn(sent[1]!, 'confirm'))).statusCode).toBe(200);
      // An earlier link to the same address has nothing left to do.
      expect((await confirm(tokenIn(sent[0]!, 'confirm'))).statusCode).toBe(400);
      expect((await sendAgain(cookies)).statusCode).toBe(400);
    });

    it('lasts seven days', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { confirmation } = await signUp();
      vi.setSystemTime(Date.now() + 8 * DAY);
      expect((await confirm(tokenIn(confirmation, 'confirm'))).statusCode).toBe(400);
    });
  });

  describe('changing email', () => {
    const change = (cookies: Record<string, string>, email: string, password = 'correct horse') =>
      app.inject({ method: 'POST', url: '/api/account/email', payload: { email, password }, cookies });
    const confirm = (token: string) => app.inject({ method: 'POST', url: '/api/auth/confirm', payload: { token } });
    const login = (email: string) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'correct horse' } });

    it('moves the profile to the new address only once its link is opened', async () => {
      const { cookies } = await signUp();
      const res = await change(cookies, ' New@Example.com');
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toEqual({ email: 'student@example.com', confirmed: false, pendingEmail: 'new@example.com', reminders: false });
      expect(sent).toHaveLength(1);
      expect(sent[0]!.to).toBe('new@example.com');
      expect(sent[0]!.subject).toBe('Confirm your new email for Hours to Go');
      expect(sent[0]!.text).not.toContain('student@example.com');
      expect((await login('new@example.com')).statusCode).toBe(401);

      expect((await confirm(tokenIn(sent[0]!, 'confirm'))).json()).toEqual({ email: 'new@example.com', changed: true });
      const after = await app.inject({ method: 'GET', url: '/api/me', cookies });
      expect(after.json().user).toEqual({ email: 'new@example.com', confirmed: true, pendingEmail: null, reminders: false });
      expect((await login('new@example.com')).statusCode).toBe(200);
      expect((await login('student@example.com')).statusCode).toBe(401);
    });

    it('needs the password, and a new address no other profile has', async () => {
      const { cookies } = await signUp();
      await signUp('other@example.com');
      expect((await change(cookies, 'new@example.com', 'wrong password')).statusCode).toBe(401);
      expect((await change(cookies, 'student@example.com')).statusCode).toBe(400);
      expect((await change(cookies, 'not-an-email')).statusCode).toBe(400);
      expect((await change(cookies, 'other@example.com')).statusCode).toBe(409);
      expect((await change({}, 'new@example.com')).statusCode).toBe(401);
      expect(sent).toHaveLength(0);
    });

    it('keeps only the newest change, which can be cancelled', async () => {
      const { cookies } = await signUp();
      await change(cookies, 'first@example.com');
      await change(cookies, 'second@example.com');
      expect((await confirm(tokenIn(sent[0]!, 'confirm'))).statusCode).toBe(400);
      const cancelled = await app.inject({ method: 'DELETE', url: '/api/account/email', cookies });
      expect(cancelled.json().user.pendingEmail).toBeNull();
      expect((await confirm(tokenIn(sent[1]!, 'confirm'))).statusCode).toBe(400);
      expect((await login('student@example.com')).statusCode).toBe(200);
    });

    it('leaves no old link that could move it back, and no reset link at the old address', async () => {
      const { cookies, confirmation } = await signUp();
      await app.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'student@example.com' } });
      await vi.waitFor(() => expect(sent).toHaveLength(1));
      await change(cookies, 'new@example.com');
      expect((await confirm(tokenIn(sent[1]!, 'confirm'))).statusCode).toBe(200);

      expect((await confirm(tokenIn(confirmation, 'confirm'))).statusCode).toBe(400);
      const reset = await app.inject({ method: 'POST', url: '/api/auth/reset', payload: { token: tokenIn(sent[0]!, 'reset'), password: 'taken over' } });
      expect(reset.statusCode).toBe(400);
      expect((await login('new@example.com')).statusCode).toBe(200);
    });

    it('keeps the old address if another profile has taken the new one since', async () => {
      const { cookies } = await signUp();
      await change(cookies, 'new@example.com');
      await signUp('new@example.com');
      const res = await confirm(tokenIn(sent[0]!, 'confirm'));
      expect(res.statusCode).toBe(409);
      expect((await login('student@example.com')).statusCode).toBe(200);
    });
  });

  describe('changing password', () => {
    const changePassword = (cookies: Record<string, string>, password: string, newPassword: string) =>
      app.inject({ method: 'POST', url: '/api/account/password', payload: { password, newPassword }, cookies });
    const login = (password: string) =>
      app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'student@example.com', password } });

    it('takes the old password, and signs out every other device', async () => {
      const { cookies: here } = await signUp();
      const other = await login('correct horse');
      const there = { htg_session: other.cookies.find((c) => c.name === 'htg_session')!.value };

      expect((await changePassword(here, 'correct horse', 'a new long password')).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/api/me', cookies: here })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/me', cookies: there })).statusCode).toBe(401);
      expect((await login('correct horse')).statusCode).toBe(401);
      expect((await login('a new long password')).statusCode).toBe(200);
    });

    it('refuses a wrong old password and a short new one, and slows down guessing', async () => {
      const { cookies } = await signUp();
      expect((await changePassword(cookies, 'correct horse', 'short')).statusCode).toBe(400);
      let last = 0;
      for (let i = 0; i < 11; i++) last = (await changePassword(cookies, `guess ${i}`, 'a new long password')).statusCode;
      expect(last).toBe(429);
      expect((await login('correct horse')).statusCode).toBe(200);
    });
  });

  describe('sign-up protection', () => {
    it('takes at most 20 new profiles an hour from one network', async () => {
      for (let i = 0; i < 20; i++) expect((await signUp(`pilot${i}@example.com`)).res.statusCode).toBe(200);
      const res = await signUp('one-too-many@example.com');
      expect(res.res.statusCode).toBe(429);
      expect(res.res.json().error).toMatch(/Too many profiles/);
    });
  });

  describe('feedback', () => {
    const feedback =(payload: object, cookies: Record<string, string> = {}) =>
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

describe.each(DATABASES)('a database made before migrations, on $name', ({ url }) => {
  it('keeps its profiles, gains the new steps, and runs each step only once', async () => {
    // What the first release made, with a pilot in it: on PGlite in a folder, so it outlasts the server.
    const folder = url === 'memory://' ? mkdtempSync(join(tmpdir(), 'htg-')) : null;
    const where = folder ?? (await emptied(url));
    const before = [
      `create table users (
        id text primary key, email text not null unique, password_hash text not null,
        created_at timestamptz not null default now())`,
      `insert into users (id, email, password_hash) values ('u1', 'student@example.com', '${await hashPassword('correct horse')}')`,
    ];
    if (folder) {
      const db = new PGlite(folder);
      for (const statement of before) await db.query(statement);
      await db.close();
    } else {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      for (const statement of before) await client.query(statement);
      await client.end();
    }

    try {
      // Started twice, as on every deploy: a step run again would fail on its own column.
      for (let start = 0; start < 2; start++) {
        const api = await buildApp({ database: where, secureCookies: false });
        try {
          const res = await api.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'student@example.com', password: 'correct horse' } });
          expect(res.statusCode).toBe(200);
          expect(res.json().user).toEqual({ email: 'student@example.com', confirmed: false, pendingEmail: null, reminders: false });
        } finally {
          await api.close();
        }
      }
    } finally {
      if (folder) rmSync(folder, { recursive: true, force: true });
    }
    // PGlite takes a second or two to open a folder, and this opens one three times.
  }, 30_000);
});

describe('the memory the limits use', () => {
  it('stays bounded however many different keys arrive', () => {
    const limit = new Throttle(5, 60_000);
    for (let i = 0; i < 12_000; i++) limit.fail(`key-${i}`, 1_000);
    expect(limit.size).toBeLessThanOrEqual(10_000);
  });

  it('forgets expired keys first', () => {
    const limit = new Throttle(5, 60_000);
    for (let i = 0; i < 10_000; i++) limit.fail(`old-${i}`, 1_000);
    limit.fail('new', 120_000);
    expect(limit.size).toBe(1);
  });
});

describe('one pilot’s record that can’t be worked out', () => {
  it('doesn’t cost everyone else their reminder', async () => {
    const mails: Mail[] = [];
    const errors: string[] = [];
    const book = { version: 2, entries: [], profile: { ...blankProfile(), medical: 'cat3', medicalUntil: addDays(today(), 7) } };
    const store = {
      reminderRecipients: async () => [
        { id: 'broken', email: 'broken@example.com', stop: 's1', lang: 'en' },
        { id: 'fine', email: 'fine@example.com', stop: 's2', lang: 'en' },
      ],
      getLogbook: async (id: string) => {
        if (id === 'broken') throw new RangeError('Invalid time value');
        return book;
      },
      sentReminders: async () => new Set<string>(),
      markReminders: async () => undefined,
    } as unknown as Store;
    const run = await sendReminders(store, async (m) => void mails.push(m), APP_URL, (_e, what) => errors.push(what));
    expect(mails.map((m) => m.to)).toEqual(['fine@example.com']);
    expect(run).toMatchObject({ checked: 2, sent: 1, failed: 1 });
    expect(errors).toEqual(['reminders not worked out']);
  });
});

describe('a server that can’t send email', () => {
  it('says resetting, confirming and feedback are unavailable rather than pretending to send', async () => {
    const api = await buildApp({ database: 'memory://', secureCookies: false });
    try {
      const res = await api.inject({ method: 'POST', url: '/api/auth/forgot', payload: { email: 'student@example.com' } });
      expect(res.statusCode).toBe(503);
      const feedback = await api.inject({ method: 'POST', url: '/api/feedback', payload: { message: 'Hello' } });
      expect(feedback.statusCode).toBe(503);
      const signup = await api.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'student@example.com', password: 'correct horse' } });
      expect(signup.statusCode).toBe(200);
      const cookies = { htg_session: signup.cookies.find((c) => c.name === 'htg_session')!.value };
      expect((await api.inject({ method: 'POST', url: '/api/account/confirm', cookies })).statusCode).toBe(503);
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

  it('tells the owner when a pilot’s email couldn’t be sent', async () => {
    const alerts: Mail[] = [];
    const api = await buildApp({
      database: 'memory://',
      secureCookies: false,
      appUrl: APP_URL,
      alertTo: OWNER,
      sendMail: async (mail) => {
        if (mail.to !== OWNER) throw new Error('Resend answered 422: the daily quota is used up');
        alerts.push(mail);
      },
    });
    try {
      await api.inject({ method: 'POST', url: '/api/auth/signup', payload: { email: 'student@example.com', password: 'correct horse' } });
      await vi.waitFor(() => expect(alerts).toHaveLength(1));
      expect(alerts[0]!.subject).toBe('Hours to Go: confirmation email not sent');
      expect(alerts[0]!.text).toContain('the daily quota is used up');
    } finally {
      await api.close();
    }
  });
});

describe('a failure on the server', () => {
  let api: FastifyInstance;
  let alerts: Mail[];
  beforeEach(async () => {
    alerts = [];
    api = await buildApp({
      database: 'memory://',
      secureCookies: false,
      alertTo: OWNER,
      sendMail: async (mail) => {
        alerts.push(mail);
      },
    });
    api.post('/api/test/fail', async () => {
      throw new Error('the database fell over');
    });
  });
  afterEach(() => api.close());

  it('tells the pilot plainly, and emails the owner a few times an hour at most', async () => {
    const res = await api.inject({ method: 'POST', url: '/api/test/fail', payload: { password: 'secret words' } });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'Something went wrong on our side. Try again in a few minutes.' });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.to).toBe(OWNER);
    expect(alerts[0]!.subject).toBe('Hours to Go: POST /api/test/fail failed');
    expect(alerts[0]!.text).toContain('Error: the database fell over');
    // What was sent with the request stays out of the email.
    expect(alerts[0]!.text).not.toContain('secret words');

    for (let i = 0; i < 6; i++) await api.inject({ method: 'POST', url: '/api/test/fail' });
    expect(alerts).toHaveLength(5);
  });

  it('says why a request was wrong, and emails nobody', async () => {
    const res = await api.inject({ method: 'POST', url: '/api/auth/login', headers: { 'content-type': 'application/json' }, payload: '{not json' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/JSON/);
    expect(alerts).toHaveLength(0);
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
