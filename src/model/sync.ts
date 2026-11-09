/**
 * Signed in, every change is kept on this device until the server has it (D41). A pilot with no
 * signal at the airport loses nothing: the change shows at once, waits here, and goes when the
 * connection comes back, even if the app was closed in between.
 */
import type { Entry } from './entry';
import type { Profile } from './profile';
import { parseEntry, parseLogbook, parseProfile, type Logbook } from './store';

/**
 * One field of the profile, or one item of a field that is a set (a licence held, a milestone, a
 * training start). Sent as changes rather than as the whole profile, so a phone that was offline
 * for a week doesn't undo what was changed on the laptop meanwhile.
 */
export interface ProfileChange {
  key: keyof Profile;
  item?: string;
  value?: unknown;
  removed?: true;
}

/** A change the server doesn't have yet. Each is safe to send twice: a line is stored by its id. */
export type Op = { kind: 'entry'; entry: Entry } | { kind: 'delete'; id: string } | { kind: 'profile'; changes: ProfileChange[] };

const SETS = ['held', 'milestones', 'trainingStart'] as const;
const isSet = (key: string): key is (typeof SETS)[number] => (SETS as readonly string[]).includes(key);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function profileChanges(before: Profile, after: Profile): ProfileChange[] {
  const out: ProfileChange[] = [];
  for (const key of Object.keys(after) as (keyof Profile)[]) {
    if (isSet(key)) {
      const a: Record<string, unknown> = before[key];
      const b: Record<string, unknown> = after[key];
      for (const item of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!(item in b)) out.push({ key, item, removed: true });
        else if (!same(a[item], b[item])) out.push({ key, item, value: b[item] });
      }
    } else if (!same(before[key], after[key])) {
      out.push({ key, value: after[key] });
    }
  }
  return out;
}

export function applyChanges(profile: Profile, changes: readonly ProfileChange[]): Profile {
  const next: Record<string, unknown> = { ...profile };
  for (const c of changes) {
    if (c.item === undefined) {
      next[c.key] = c.value;
      continue;
    }
    const set = { ...(next[c.key] as Record<string, unknown>) };
    if (c.removed) delete set[c.item];
    else set[c.item] = c.value;
    next[c.key] = set;
  }
  return parseProfile(next);
}

export function applyOps(book: Logbook, ops: readonly Op[]): Logbook {
  return ops.reduce((b, op): Logbook => {
    if (op.kind === 'delete') return { ...b, entries: b.entries.filter((e) => e.id !== op.id) };
    if (op.kind === 'profile') return { ...b, profile: applyChanges(b.profile, op.changes) };
    const { entry } = op;
    return { ...b, entries: b.entries.some((e) => e.id === entry.id) ? b.entries.map((e) => (e.id === entry.id ? entry : e)) : [...b.entries, entry] };
  }, book);
}

/** The signed-in profile as this device last knew it: enough to open with no connection. */
export interface AccountCopy {
  account: { email: string; confirmed: boolean; pendingEmail: string | null };
  /** The logbook as the server last had it. */
  server: Logbook;
  /** Changes made here that the server doesn't have yet, oldest first. */
  ops: Op[];
}

const LAST_KEY = 'hours-to-go/account';
// One copy per address, so changes waiting for one profile never go to another signed in after it.
const copyKey = (email: string) => `hours-to-go/account/${email}`;

function parseOp(x: unknown): Op | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  if (o.kind === 'entry') {
    const entry = parseEntry(o.entry);
    return entry ? { kind: 'entry', entry } : null;
  }
  if (o.kind === 'delete' && typeof o.id === 'string') return { kind: 'delete', id: o.id };
  if (o.kind === 'profile' && Array.isArray(o.changes)) return { kind: 'profile', changes: o.changes as ProfileChange[] };
  return null;
}

/** The copy for the profile signed in here last, or for `email`; null when there is none. */
export function loadCopy(email: string | null = lastAccount()): AccountCopy | null {
  if (!email) return null;
  try {
    const x = JSON.parse(localStorage.getItem(copyKey(email)) ?? 'null') as Partial<AccountCopy> | null;
    const server = parseLogbook(x?.server);
    if (!x?.account || x.account.email !== email || !server) return null;
    const ops = Array.isArray(x.ops) ? x.ops.map(parseOp).filter((o): o is Op => o !== null) : [];
    return { account: x.account, server, ops };
  } catch {
    return null;
  }
}

/** Returns false when the browser refused to store it; the changes then go to the server only. */
export function saveCopy(copy: AccountCopy): boolean {
  try {
    localStorage.setItem(copyKey(copy.account.email), JSON.stringify(copy));
    localStorage.setItem(LAST_KEY, copy.account.email);
    return true;
  } catch {
    return false;
  }
}

/** Signing out takes the profile off this device. */
export function clearCopy(email: string): void {
  try {
    localStorage.removeItem(copyKey(email));
    if (localStorage.getItem(LAST_KEY) === email) localStorage.removeItem(LAST_KEY);
  } catch {
    // Storage is blocked, so nothing was kept.
  }
}

export function lastAccount(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
