import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { newId, type Entry } from '../src/model/entry';
import { blankProfile, type Profile } from '../src/model/profile';
import { mergeLogbooks, parseEntry, parseProfile, type Logbook } from '../src/model/store';

export interface User {
  id: string;
  email: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

/** One statement, its rows back. */
type Query = <T>(text: string, params?: unknown[]) => Promise<T[]>;

/** What the store needs from a database, so the same SQL runs on a Postgres server and on PGlite. */
interface Db {
  query: Query;
  transaction<T>(fn: (q: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const SCHEMA = [
  `create table if not exists users (
    id text primary key,
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists sessions (
    token_hash text primary key,
    user_id text not null references users(id) on delete cascade,
    expires_at bigint not null
  )`,
  'create index if not exists sessions_user on sessions(user_id)',
  `create table if not exists entries (
    user_id text not null references users(id) on delete cascade,
    id text not null,
    data jsonb not null,
    primary key (user_id, id)
  )`,
  `create table if not exists profiles (
    user_id text primary key references users(id) on delete cascade,
    data jsonb not null
  )`,
  // A new table, so `if not exists` is all it needs, on a laptop and on Neon alike.
  `create table if not exists password_resets (
    token_hash text primary key,
    user_id text not null references users(id) on delete cascade,
    expires_at bigint not null
  )`,
  'create index if not exists password_resets_user on password_resets(user_id)',
];

/**
 * A Postgres server (Neon in production). The `error` listener is not
 * optional: a hosted database drops idle connections, `pg` reports that on
 * the pool with nothing awaiting it, and an unhandled `error` event would
 * take the whole server down. The pool opens a new connection when next asked.
 */
function server(url: string, onError: (err: Error) => void): Db {
  const pool = new pg.Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
  pool.on('error', onError);
  return {
    query: async (text, params) => (await pool.query(text, params)).rows,
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(async (text, params) => (await client.query(text, params)).rows);
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Postgres compiled to WebAssembly, in this process: a folder on disk, or `memory://`. Nothing to install. */
function embedded(where: string): Db {
  const db = new PGlite(where);
  return {
    query: async (text, params) => (await db.query(text, params)).rows as never,
    transaction: (fn) => db.transaction((tx) => fn(async (text, params) => (await tx.query(text, params)).rows as never)),
    close: () => db.close(),
  };
}

async function readLogbook(q: Query, userId: string): Promise<Logbook> {
  const rows = await q<{ data: unknown }>('select data from entries where user_id = $1 order by id', [userId]);
  const entries = rows.map((r) => parseEntry(r.data)).filter((e): e is Entry => e !== null);
  const [p] = await q<{ data: unknown }>('select data from profiles where user_id = $1', [userId]);
  const profile = p ? parseProfile(p.data) : blankProfile();
  return { version: 2, entries, profile };
}

async function writeProfile(q: Query, userId: string, profile: Profile): Promise<void> {
  await q('insert into profiles (user_id, data) values ($1, $2) on conflict (user_id) do update set data = excluded.data', [
    userId,
    JSON.stringify(profile),
  ]);
}

/**
 * Accounts and logbooks. Each entry is its own row so two devices editing
 * different flights never overwrite each other; the profile (licences held,
 * exams, medical) is one row per pilot.
 */
export class Store {
  private constructor(private readonly db: Db) {}

  /**
   * `where` is a `postgres://` URL for a Postgres server, or for PGlite a
   * folder to keep the database in, or `memory://` for one that lasts as long
   * as the process.
   */
  static async open(where: string, onPoolError: (err: Error) => void = () => {}): Promise<Store> {
    const db = /^postgres(ql)?:\/\//.test(where) ? server(where, onPoolError) : embedded(where);
    try {
      for (const statement of SCHEMA) await db.query(statement);
    } catch (err) {
      await db.close().catch(() => {});
      throw err;
    }
    return new Store(db);
  }

  close(): Promise<void> {
    return this.db.close();
  }

  /** For the health check: does the database answer? */
  async ping(): Promise<void> {
    await this.db.query('select 1');
  }

  /** Returns null when the email is already registered. */
  async createUser(email: string, passwordHash: string): Promise<User | null> {
    const id = newId();
    const rows = await this.db.query(
      'insert into users (id, email, password_hash) values ($1, $2, $3) on conflict (email) do nothing returning id',
      [id, email, passwordHash],
    );
    return rows.length > 0 ? { id, email } : null;
  }

  async findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const [row] = await this.db.query<UserRow>('select id, email, password_hash from users where email = $1', [email]);
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
  }

  async passwordHashFor(userId: string): Promise<string | null> {
    const [row] = await this.db.query<{ password_hash: string }>('select password_hash from users where id = $1', [userId]);
    return row?.password_hash ?? null;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.db.query('delete from users where id = $1', [userId]);
  }

  async createSession(userId: string, tokenHash: string, expiresAt: number): Promise<void> {
    await this.db.query('delete from sessions where expires_at < $1', [Date.now()]);
    await this.db.query('insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)', [tokenHash, userId, expiresAt]);
  }

  /** Pushes a session's end back, so a pilot who keeps using the app stays signed in. */
  async extendSession(tokenHash: string, expiresAt: number): Promise<void> {
    await this.db.query('update sessions set expires_at = $2 where token_hash = $1', [tokenHash, expiresAt]);
  }

  async userForSession(tokenHash: string, now: number): Promise<User | null> {
    const [row] = await this.db.query<User>(
      'select u.id, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > $2',
      [tokenHash, now],
    );
    return row ? { id: row.id, email: row.email } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.query('delete from sessions where token_hash = $1', [tokenHash]);
  }

  async createPasswordReset(userId: string, tokenHash: string, expiresAt: number): Promise<void> {
    await this.db.query('delete from password_resets where expires_at < $1', [Date.now()]);
    await this.db.query('insert into password_resets (token_hash, user_id, expires_at) values ($1, $2, $3)', [
      tokenHash,
      userId,
      expiresAt,
    ]);
  }

  /**
   * Spends a reset link on a new password. The link is deleted as it is read, so it works once;
   * the profile's other links go too, and so does every session, so a device signed in by
   * whoever knew the old password is signed out. Null when the link is unknown or expired.
   */
  resetPassword(tokenHash: string, passwordHash: string, now: number): Promise<User | null> {
    return this.db.transaction(async (q) => {
      const [spent] = await q<{ user_id: string }>(
        'delete from password_resets where token_hash = $1 and expires_at > $2 returning user_id',
        [tokenHash, now],
      );
      if (!spent) return null;
      await q('update users set password_hash = $2 where id = $1', [spent.user_id, passwordHash]);
      await q('delete from password_resets where user_id = $1', [spent.user_id]);
      await q('delete from sessions where user_id = $1', [spent.user_id]);
      const [user] = await q<User>('select id, email from users where id = $1', [spent.user_id]);
      return user ? { id: user.id, email: user.email } : null;
    });
  }

  getLogbook(userId: string): Promise<Logbook> {
    return readLogbook(this.db.query, userId);
  }

  async putEntry(userId: string, entry: Entry): Promise<void> {
    await this.db.query(
      'insert into entries (user_id, id, data) values ($1, $2, $3) on conflict (user_id, id) do update set data = excluded.data',
      [userId, entry.id, JSON.stringify(entry)],
    );
  }

  async deleteEntry(userId: string, id: string): Promise<boolean> {
    const rows = await this.db.query('delete from entries where user_id = $1 and id = $2 returning id', [userId, id]);
    return rows.length > 0;
  }

  putProfile(userId: string, profile: Profile): Promise<void> {
    return writeProfile(this.db.query, userId, profile);
  }

  /** Adds what the account lacks; never deletes or overwrites. */
  merge(userId: string, incoming: Logbook): Promise<Logbook> {
    return this.db.transaction(async (q) => {
      const merged = mergeLogbooks(await readLogbook(q, userId), incoming);
      // One statement for the whole logbook: a pilot's paper history can be hundreds of lines.
      await q(
        `insert into entries (user_id, id, data)
         select $1, e->>'id', e from jsonb_array_elements($2::jsonb) e
         on conflict (user_id, id) do nothing`,
        [userId, JSON.stringify(incoming.entries)],
      );
      await writeProfile(q, userId, merged.profile);
      return readLogbook(q, userId);
    });
  }
}
