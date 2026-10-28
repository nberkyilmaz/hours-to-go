import {
  AFTER_PPL_FIELDS,
  COUNT_COLUMNS,
  TIME_COLUMNS,
  blankBreakdown,
  blankEntry,
  newId,
  type Answer,
  type Breakdown,
  type Entry,
} from './entry';
import { GOAL_IDS, blankProfile, type GoalId, type Medical, type MilestoneRecord, type Profile } from './profile';

/**
 * Everything one pilot has logged. Signed in, it lives on the server; as a
 * guest, it lives in this browser's localStorage until it is moved into an
 * account.
 */
export interface Logbook {
  version: 2;
  entries: Entry[];
  profile: Profile;
}

const GUEST_KEY = 'hours-to-go/v1';

export function emptyLogbook(): Logbook {
  return { version: 2, entries: [], profile: blankProfile() };
}

export function loadGuestLogbook(): Logbook {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return emptyLogbook();
    return parseLogbook(JSON.parse(raw)) ?? emptyLogbook();
  } catch {
    return emptyLogbook();
  }
}

/** Returns false when the browser refused to store it (private window, storage full, blocked). */
export function saveGuestLogbook(book: Logbook): boolean {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(book));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestLogbook(): void {
  try {
    localStorage.removeItem(GUEST_KEY);
  } catch {
    // Nothing stored, or storage is blocked; either way there is nothing left to clear.
  }
}

const SIGNED_IN_KEY = 'hours-to-go/signed-in';

/**
 * Whether this browser was signed in when last used. The server may be asleep and take a
 * minute to answer, so a browser that never signed in opens as a guest without asking it.
 */
export function wasSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // Storage is blocked; the next visit opens as a guest and the pilot signs in again.
  }
}

const WELCOMED_KEY = 'hours-to-go/welcomed';

/**
 * Whether this browser has been past the welcome screen, by signing in or by choosing to
 * go on without a profile. Blocked storage reads as yes: a welcome that came back on every
 * visit would be worse than none.
 */
export function wasWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === '1';
  } catch {
    return true;
  }
}

export function rememberWelcomed(): void {
  try {
    localStorage.setItem(WELCOMED_KEY, '1');
  } catch {
    // Nothing to do: wasWelcomed() already answers yes when storage is blocked.
  }
}

/** True when a guest logbook holds anything worth keeping. */
export function hasContent(book: Logbook): boolean {
  const p = book.profile;
  return book.entries.length > 0 || Object.keys(p.held).length > 0 || Object.keys(p.milestones).length > 0 || p.medical !== 'none';
}

/**
 * Folds `incoming` into `base` without deleting anything. Entries are matched
 * by id and `base` wins when both have one; profile items `base` lacks are
 * added. Used when a guest logbook moves into an account, and for imports.
 */
export function mergeLogbooks(base: Logbook, incoming: Logbook): Logbook {
  const ids = new Set(base.entries.map((e) => e.id));
  const entries = [...base.entries, ...incoming.entries.filter((e) => !ids.has(e.id))];
  const b = base.profile;
  const i = incoming.profile;
  const profile: Profile = {
    medical: b.medical !== 'none' ? b.medical : i.medical,
    held: { ...i.held, ...b.held },
    milestones: { ...i.milestones, ...b.milestones },
    trainingStart: { ...i.trainingStart, ...b.trainingStart },
    // A brand-new account has not chosen anything yet; keep what the guest was working on.
    focus: hasContent(base) ? b.focus : i.focus,
  };
  return { version: 2, entries, profile };
}

const MEDICALS: readonly Medical[] = ['none', 'cat4', 'cat3', 'cat1'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Far above any career, so a typo or a hostile file can't overflow a total. */
const MAX_MINUTES = 60 * 60_000;

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max = 200): string => (typeof x === 'string' ? x.slice(0, max) : '');
const whole = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? Math.min(Math.round(x), MAX_MINUTES) : 0);
const isGoal = (x: string): x is GoalId => (GOAL_IDS as readonly string[]).includes(x);

/**
 * The first version stored one role per line (dual, solo, PIC, co-pilot) with
 * a total and a night part. This puts that time into the paper-log columns.
 */
function fromFirstVersion(x: Record<string, unknown>): Record<string, unknown> {
  const n = (k: string) => whole(x[k]);
  const out: Record<string, unknown> = {
    id: x.id,
    forward: x.forward,
    date: x.date,
    aircraft: x.aircraft,
    registration: x.registration,
    remarks: str(x.remarks, 2000),
    approaches: n('approaches'),
  };
  if (x.kind === 'sim') return { ...out, ftd: n('total') };

  const night = Math.min(n('night'), n('total'));
  const day = n('total') - night;
  const xcNight = Math.min(n('xcNight'), n('xc'));
  const xcDay = n('xc') - xcNight;
  const engine = x.multiEngine === true ? 'me' : 'se';
  const role = x.role;
  // A single-engine line has no co-pilot column; such time can only have been multi-crew.
  const kind = role === 'dual' ? 'Dual' : role === 'copilot' ? 'Copilot' : 'Pic';
  const prefix = kind === 'Copilot' ? 'me' : engine;
  out[`${prefix}Day${kind}`] = day;
  out[`${prefix}Night${kind}`] = night;
  if (kind !== 'Copilot') {
    out[`xcDay${kind}`] = xcDay;
    out[`xcNight${kind}`] = xcNight;
  }
  out.solo = role === 'solo';
  out.actualImc = n('actualImc');
  out.hood = n('hood');
  out.dayLandings = n('dayLandings');
  out.nightLandings = n('nightLandings');

  const stops = str(x.route).split(/[\s>–-]+/).filter(Boolean);
  out.from = stops[0] ?? '';
  out.to = stops.length > 1 ? stops[stops.length - 1] : '';
  if (stops.length > 2) out.remarks = [`via ${stops.slice(1, -1).join(', ')}`, out.remarks].filter(Boolean).join('. ');
  return out;
}

const answer = (x: unknown): Answer | null => (x === 'all' || x === 'none' || x === 'some' ? x : null);

function parseBreakdown(x: Record<string, unknown>): Breakdown {
  const b = blankBreakdown();
  b.solo = answer(x.solo);
  b.soloDay = whole(x.soloDay);
  b.soloNight = whole(x.soloNight);
  b.soloXc = whole(x.soloXc);
  b.afterPpl = answer(x.afterPpl);
  const after = isObject(x.after) ? x.after : {};
  for (const f of AFTER_PPL_FIELDS) b.after[f] = whole(after[f]);
  return b;
}

/** Accepts anything and returns a clean entry, or null when it is not one. */
export function parseEntry(raw: unknown): Entry | null {
  if (!isObject(raw)) return null;
  const x = 'role' in raw || 'kind' in raw ? fromFirstVersion(raw) : raw;
  const date = str(x.date);
  if (!DATE.test(date)) return null;
  const entry = blankEntry(x.forward === true, date);
  entry.id = str(x.id, 64) || newId();
  entry.aircraft = str(x.aircraft);
  entry.registration = str(x.registration);
  entry.from = str(x.from);
  entry.to = str(x.to);
  entry.solo = x.solo === true;
  entry.soloNightLandings = whole(x.soloNightLandings);
  // Paper totals saved before the questions existed keep the Solo tick box's meaning until edited.
  entry.breakdown = entry.forward && isObject(x.breakdown) ? parseBreakdown(x.breakdown) : null;
  entry.remarks = str(x.remarks, 2000);
  for (const c of TIME_COLUMNS) entry[c] = whole(x[c]);
  for (const c of COUNT_COLUMNS) entry[c] = whole(x[c]);
  return entry;
}

export function parseProfile(x: unknown): Profile {
  const p = blankProfile();
  if (!isObject(x)) return p;
  p.medical = MEDICALS.find((m) => m === x.medical) ?? 'none';
  if (typeof x.focus === 'string' && isGoal(x.focus)) p.focus = x.focus;
  if (isObject(x.held)) {
    for (const [k, v] of Object.entries(x.held)) {
      if (isGoal(k) && isObject(v)) p.held[k] = { date: DATE.test(str(v.date)) ? str(v.date) : '' };
    }
  }
  if (isObject(x.trainingStart)) {
    for (const [k, v] of Object.entries(x.trainingStart)) {
      if (isGoal(k) && DATE.test(str(v))) p.trainingStart[k] = str(v);
    }
  }
  if (isObject(x.milestones)) {
    for (const [k, v] of Object.entries(x.milestones).slice(0, 200)) {
      if (!isObject(v) || k.length > 64) continue;
      const rec: MilestoneRecord = { date: DATE.test(str(v.date)) ? str(v.date) : '' };
      if (typeof v.score === 'number' && Number.isFinite(v.score)) rec.score = Math.max(0, Math.min(100, v.score));
      p.milestones[k] = rec;
    }
  }
  return p;
}

/** Accepts anything (stored, uploaded or imported) and returns a clean logbook, or null if it is not one. */
export function parseLogbook(x: unknown): Logbook | null {
  if (!isObject(x) || (x.version !== 1 && x.version !== 2) || !Array.isArray(x.entries)) return null;
  const entries = x.entries.map(parseEntry).filter((e): e is Entry => e !== null);
  return { version: 2, entries, profile: parseProfile(x.profile) };
}
