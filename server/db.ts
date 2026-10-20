import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncClass } from 'node:sqlite';
import { newId, type Entry } from '../src/model/entry';
import { blankProfile, type Profile } from '../src/model/profile';
import { mergeLogbooks, parseEntry, parseProfile, type Logbook } from '../src/model/store';

// Vite (and so Vitest) strips the `node:` prefix from imports it does not
// know, and `sqlite` only exists with the prefix. Requiring it sidesteps that.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

export interface User {
  id: string;
  email: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

/**
 * Accounts and logbooks in one SQLite file. Each entry is its own row so two
 * devices editing different flights never overwrite each other; the profile
 * (licences held, exams, medical) is one row per pilot.
 */
export class Store {
  private db: DatabaseSyncClass;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      pragma journal_mode = wal;
      pragma foreign_keys = on;
      create table if not exists users (
        id text primary key,
        email text not null unique,
        password_hash text not null,
        created_at text not null
      );
      create table if not exists sessions (
        token_hash text primary key,
        user_id text not null references users(id) on delete cascade,
        expires_at integer not null
      );
      create index if not exists sessions_user on sessions(user_id);
      create table if not exists entries (
        user_id text not null references users(id) on delete cascade,
        id text not null,
        data text not null,
        primary key (user_id, id)
      );
      create table if not exists profiles (
        user_id text primary key references users(id) on delete cascade,
        data text not null
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  /** Returns null when the email is already registered. */
  createUser(email: string, passwordHash: string): User | null {
    const id = newId();
    try {
      this.db
        .prepare('insert into users (id, email, password_hash, created_at) values (?, ?, ?, ?)')
        .run(id, email, passwordHash, new Date().toISOString());
    } catch (err) {
      if (String(err).includes('UNIQUE')) return null;
      throw err;
    }
    return { id, email };
  }

  findUserByEmail(email: string): (User & { passwordHash: string }) | null {
    const row = this.db.prepare('select id, email, password_hash from users where email = ?').get(email) as UserRow | undefined;
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
  }

  passwordHashFor(userId: string): string | null {
    const row = this.db.prepare('select password_hash from users where id = ?').get(userId) as { password_hash: string } | undefined;
    return row?.password_hash ?? null;
  }

  deleteUser(userId: string): void {
    this.db.prepare('delete from users where id = ?').run(userId);
  }

  createSession(userId: string, tokenHash: string, expiresAt: number): void {
    this.db.prepare('delete from sessions where expires_at < ?').run(Date.now());
    this.db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').run(tokenHash, userId, expiresAt);
  }

  userForSession(tokenHash: string, now: number): User | null {
    const row = this.db
      .prepare('select u.id, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = ? and s.expires_at > ?')
      .get(tokenHash, now) as User | undefined;
    return row ? { id: row.id, email: row.email } : null;
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('delete from sessions where token_hash = ?').run(tokenHash);
  }

  getLogbook(userId: string): Logbook {
    const rows = this.db.prepare('select data from entries where user_id = ?').all(userId) as { data: string }[];
    const entries = rows.map((r) => parseEntry(JSON.parse(r.data))).filter((e): e is Entry => e !== null);
    const p = this.db.prepare('select data from profiles where user_id = ?').get(userId) as { data: string } | undefined;
    const profile = p ? parseProfile(JSON.parse(p.data)) : blankProfile();
    return { version: 2, entries, profile };
  }

  putEntry(userId: string, entry: Entry): void {
    this.db
      .prepare('insert into entries (user_id, id, data) values (?, ?, ?) on conflict (user_id, id) do update set data = excluded.data')
      .run(userId, entry.id, JSON.stringify(entry));
  }

  deleteEntry(userId: string, id: string): boolean {
    const r = this.db.prepare('delete from entries where user_id = ? and id = ?').run(userId, id);
    return Number(r.changes) > 0;
  }

  putProfile(userId: string, profile: Profile): void {
    this.db
      .prepare('insert into profiles (user_id, data) values (?, ?) on conflict (user_id) do update set data = excluded.data')
      .run(userId, JSON.stringify(profile));
  }

  /** Adds what the account lacks; never deletes or overwrites. */
  merge(userId: string, incoming: Logbook): Logbook {
    this.db.exec('begin');
    try {
      const merged = mergeLogbooks(this.getLogbook(userId), incoming);
      const add = this.db.prepare('insert into entries (user_id, id, data) values (?, ?, ?) on conflict (user_id, id) do nothing');
      for (const e of incoming.entries) add.run(userId, e.id, JSON.stringify(e));
      this.putProfile(userId, merged.profile);
      this.db.exec('commit');
      return this.getLogbook(userId);
    } catch (err) {
      this.db.exec('rollback');
      throw err;
    }
  }
}
