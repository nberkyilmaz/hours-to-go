import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { newId, type Entry } from '../src/model/entry';
import { blankProfile, type Profile } from '../src/model/profile';
import { mergeLogbooks, parseEntry, parseProfile, type Logbook } from '../src/model/store';

export interface User {
  id: string;
  email: string;
  /** The pilot has opened a link emailed to this address. */
  confirmed: boolean;
}

/** What the app shows about a profile: its address, whether that is confirmed, and an address it is changing to. */
export interface Account {
  email: string;
  confirmed: boolean;
  pendingEmail: string | null;
}

/** What spending an emailed link did: confirmed the profile's address, or moved the profile to a new one. */
export type EmailLinkResult = { email: string; changed: boolean } | 'taken' | null;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  confirmed: boolean;
}

const USER_COLUMNS = 'id, email, email_confirmed_at is not null as confirmed';

/** One statement, its rows back. */
type Query = <T>(text: string, params?: unknown[]) => Promise<T[]>;

/** What the store needs from a database, so the same SQL runs on a Postgres server and on PGlite. */
interface Db {
  query: Query;
  transaction<T>(fn: (q: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * The tables, as numbered steps, each run once and in order when the server starts; the
 * `migrations` table remembers which have run. Add a step at the end. Never change one that has
 * been published, because Neon has already run it. Step 1 is what the app made before steps
 * existed, so on a database from then it finds everything already there.
 */
const MIGRATIONS: string[][] = [
  [
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
    `create table if not exists password_resets (
      token_hash text primary key,
      user_id text not null references users(id) on delete cascade,
      expires_at bigint not null
    )`,
    'create index if not exists password_resets_user on password_resets(user_id)',
  ],
  // 2: confirming an email address, and changing it. An emailed link carries the address it
  // confirms: the profile's own, or the one it is changing to.
  [
    'alter table users add column email_confirmed_at timestamptz',
    `create table email_links (
      token_hash text primary key,
      user_id text not null references users(id) on delete cascade,
      email text not null,
      expires_at bigint not null
    )`,
    'create index email_links_user on email_links(user_id)',
  ],
];

/**
 * Runs the steps this database hasn't had yet, all in one transaction, so a step that fails
 * leaves the database as it was. A deploy starts the new server while the old one still runs;
 * the lock makes a second server starting at the same moment wait its turn.
 */
async function migrate(db: Db): Promise<void> {
  await db.transaction(async (q) => {
    await q('select pg_advisory_xact_lock(421)');
    await q('create table if not exists migrations (step integer primary key, run_at timestamptz not null default now())');
    const [last] = await q<{ step: number | null }>('select max(step) as step from migrations');
    for (let step = (last?.step ?? 0) + 1; step <= MIGRATIONS.length; step++) {
      for (const statement of MIGRATIONS[step - 1]!) await q(statement);
      await q('insert into migrations (step) values ($1)', [step]);
    }
  });
}

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
      await migrate(db);
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
    return rows.length > 0 ? { id, email, confirmed: false } : null;
  }

  async findUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
    const [row] = await this.db.query<UserRow>(`select ${USER_COLUMNS}, password_hash from users where email = $1`, [email]);
    return row ? { id: row.id, email: row.email, confirmed: row.confirmed, passwordHash: row.password_hash } : null;
  }

  /** The newest unexpired link to an address other than the profile's own is a change waiting to be confirmed. */
  async account(userId: string, now: number): Promise<Account | null> {
    const [row] = await this.db.query<{ email: string; confirmed: boolean; pending_email: string | null }>(
      `select u.email, u.email_confirmed_at is not null as confirmed,
         (select l.email from email_links l where l.user_id = u.id and l.email <> u.email and l.expires_at > $2
          order by l.expires_at desc limit 1) as pending_email
       from users u where u.id = $1`,
      [userId, now],
    );
    return row ? { email: row.email, confirmed: row.confirmed, pendingEmail: row.pending_email } : null;
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
      `select u.id, u.email, u.email_confirmed_at is not null as confirmed
       from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > $2`,
      [tokenHash, now],
    );
    return row ? { id: row.id, email: row.email, confirmed: row.confirmed } : null;
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
   * whoever knew the old password is signed out. The link reached the profile's inbox, so the
   * address is confirmed too. Null when the link is unknown or expired.
   */
  resetPassword(tokenHash: string, passwordHash: string, now: number): Promise<User | null> {
    return this.db.transaction(async (q) => {
      const [spent] = await q<{ user_id: string }>(
        'delete from password_resets where token_hash = $1 and expires_at > $2 returning user_id',
        [tokenHash, now],
      );
      if (!spent) return null;
      await q('update users set password_hash = $2, email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [
        spent.user_id,
        passwordHash,
      ]);
      await q('delete from password_resets where user_id = $1', [spent.user_id]);
      await q('delete from sessions where user_id = $1', [spent.user_id]);
      const [user] = await q<User>(`select ${USER_COLUMNS} from users where id = $1`, [spent.user_id]);
      return user ? { id: user.id, email: user.email, confirmed: user.confirmed } : null;
    });
  }

  /**
   * A new password, from a pilot who knows the old one. Every other device is signed out, as
   * after a reset, and any reset link still waiting in the inbox stops working.
   */
  setPassword(userId: string, passwordHash: string, keepSession: string): Promise<void> {
    return this.db.transaction(async (q) => {
      await q('update users set password_hash = $2 where id = $1', [userId, passwordHash]);
      await q('delete from sessions where user_id = $1 and token_hash <> $2', [userId, keepSession]);
      await q('delete from password_resets where user_id = $1', [userId]);
    });
  }

  /**
   * A link to email to `email`: the profile's own address to confirm it, or a new one to change
   * to. Asking for a change cancels a different change still waiting; links to confirm the
   * profile's own address stay good.
   */
  async createEmailLink(userId: string, email: string, tokenHash: string, expiresAt: number): Promise<void> {
    await this.db.query('delete from email_links where expires_at < $1', [Date.now()]);
    await this.db.query('delete from email_links where user_id = $1 and email not in ($2, (select email from users where id = $1))', [
      userId,
      email,
    ]);
    await this.db.query('insert into email_links (token_hash, user_id, email, expires_at) values ($1, $2, $3, $4)', [
      tokenHash,
      userId,
      email,
      expiresAt,
    ]);
  }

  /**
   * Spends an emailed link, which works once. To the profile's own address, it confirms it. To
   * another, the profile moves to that address, confirmed, and every link it had goes: old links
   * to the old address would otherwise move it back, and reset links sent there would still work.
   * 'taken' when another profile has signed up with the new address since; null when the link is
   * unknown or expired.
   */
  spendEmailLink(tokenHash: string, now: number): Promise<EmailLinkResult> {
    return this.db.transaction(async (q) => {
      const [link] = await q<{ user_id: string; email: string }>(
        'delete from email_links where token_hash = $1 and expires_at > $2 returning user_id, email',
        [tokenHash, now],
      );
      if (!link) return null;
      const [user] = await q<{ email: string }>('select email from users where id = $1', [link.user_id]);
      if (!user) return null;
      if (link.email === user.email) {
        await q('update users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [link.user_id]);
        await q('delete from email_links where user_id = $1 and email = $2', [link.user_id, link.email]);
        return { email: link.email, changed: false };
      }
      const [other] = await q('select id from users where email = $1', [link.email]);
      if (other) return 'taken';
      await q('update users set email = $2, email_confirmed_at = now() where id = $1', [link.user_id, link.email]);
      await q('delete from email_links where user_id = $1', [link.user_id]);
      await q('delete from password_resets where user_id = $1', [link.user_id]);
      return { email: link.email, changed: true };
    });
  }

  /** Forgets a change of address that hasn't been confirmed. */
  async cancelEmailChange(userId: string): Promise<void> {
    await this.db.query('delete from email_links where user_id = $1 and email <> (select email from users where id = $1)', [userId]);
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
