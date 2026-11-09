/**
 * Which flight to fly next (D43). One flight can count toward several requirements, so each kind
 * of flight is put in the log as if it had been flown, and the real rules say what it would do.
 * Nothing here knows what a requirement needs, so it can't disagree with the Progress screen.
 *
 * It knows the standard's minimums, not the school's syllabus: it's a suggestion for a student to
 * take to their instructor, and the screen says so.
 */
import { blankEntry, derive, type Entry } from '../model/entry';
import { SAMPLE_RATES, type GoalId, type Profile } from '../model/profile';
import { priceOf } from './cost';
import { evaluateGoal, flatten, type GoalResult, type ReqResult } from './evaluate';
import { PILOT_LICENCE, type Goal, type Plan } from './goals';

type Kind = keyof Plan;

interface Log {
  licensed: boolean;
  soloed: boolean;
  /** Minutes. */
  dualXc: number;
  dualNight: number;
  nightRating: boolean;
  simulator: boolean;
}

interface Flight {
  id: string;
  name: string;
  kind: Kind;
  /** The logbook line, for a flight of this many minutes. */
  line: (minutes: number) => Partial<Entry>;
  /** Whether a student would be flying this yet. The order schools teach in, not the standard's. */
  ready?: (log: Log) => boolean;
  /** Only for these goals, where the standard lets this flight's times overlap. */
  goals?: readonly GoalId[];
  /** Tick-offs this flight could be, if flown that way. */
  couldBe?: string[];
}

const NIGHT_CIRCUITS_AN_HOUR = 6;
const DUAL_XC_BEFORE_SOLO_XC = 180;
const DUAL_NIGHT_BEFORE_SOLO_NIGHT = 300;

const soloXcReady = (log: Log) => log.licensed || log.dualXc >= DUAL_XC_BEFORE_SOLO_XC;
const soloNightReady = (log: Log) => log.licensed && (log.nightRating || log.dualNight >= DUAL_NIGHT_BEFORE_SOLO_NIGHT);

// In order of preference when two flights do the same: day before night, simple before involved.
const FLIGHTS: readonly Flight[] = [
  { id: 'dual-local', name: 'Dual, local area', kind: 'dual', line: (m) => ({ seDayDual: m }) },
  { id: 'dual-xc', name: 'Dual cross-country', kind: 'dual', line: (m) => ({ seDayDual: m, xcDayDual: m }) },
  { id: 'dual-hood', name: 'Dual, all under the hood', kind: 'dual', line: (m) => ({ seDayDual: m, hood: m }) },
  {
    id: 'dual-xc-hood',
    name: 'Dual cross-country, a third under the hood',
    kind: 'dual',
    line: (m) => ({ seDayDual: m, xcDayDual: m, hood: Math.round(m / 3) }),
    // The PPL's 17 h dual "includes" both. The CPL's instrument time is on top of its cross-country.
    goals: ['ppl', 'ifr3', 'ifr1'],
    couldBe: ['xc-ifr-100'],
  },
  { id: 'dual-night', name: 'Dual at night', kind: 'dual', line: (m) => ({ seNightDual: m }), ready: (log) => log.licensed },
  { id: 'dual-night-xc', name: 'Dual cross-country at night', kind: 'dual', line: (m) => ({ seNightDual: m, xcNightDual: m }), ready: (log) => log.licensed },
  { id: 'solo-local', name: 'Solo, local area', kind: 'solo', line: (m) => ({ seDayPic: m, solo: true }) },
  {
    id: 'solo-xc',
    name: 'Solo cross-country',
    kind: 'solo',
    line: (m) => ({ seDayPic: m, xcDayPic: m, solo: true }),
    ready: soloXcReady,
    couldBe: ['xc-ppl-150', 'xc-cpl-300'],
  },
  {
    id: 'solo-night',
    name: 'Solo night circuits',
    kind: 'solo',
    line: (m) => ({ seNightPic: m, nightLandings: Math.ceil((m / 60) * NIGHT_CIRCUITS_AN_HOUR), solo: true }),
    ready: soloNightReady,
  },
  {
    id: 'solo-night-xc',
    name: 'Solo cross-country at night',
    kind: 'solo',
    line: (m) => ({ seNightPic: m, xcNightPic: m, nightLandings: 2, solo: true }),
    ready: soloNightReady,
  },
  { id: 'ftd', name: 'FTD session with an instructor', kind: 'sim', line: (m) => ({ ftd: m }), ready: (log) => log.simulator },
];

export interface FlightCount {
  id: string;
  label: string;
  /** Left before and after this flight: minutes, or a tally for landings. */
  before: number;
  after: number;
  unit: 'hours' | 'landings';
}

export interface NextFlight {
  id: string;
  name: string;
  kind: Kind;
  minutes: number;
  /** How much closer the whole goal gets, in minutes. */
  saved: number;
  /** What it would count toward, among what is still open. */
  counts: FlightCount[];
  /** Open tick-offs this flight could also be. */
  couldBe: string[];
  /** Dollars, tax included, at the pilot's rates. */
  price: number;
  /** The logbook line for it, to start the form from. */
  line: Partial<Entry>;
}

export type NextAdvice = { status: 'before-solo' } | { status: 'ready'; best: NextFlight; others: NextFlight[] };

const SHORTEST = 60;
const LONGEST = 240;
const USUAL = 90;
const RECENT = 10;

/** The pilot's usual flight, to the half hour: the middle of their last ten. */
export function usualLength(entries: readonly Entry[]): number {
  const recent = entries
    .filter((e) => !e.forward && derive(e).total > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, RECENT)
    .map((e) => derive(e).total)
    .sort((a, b) => a - b);
  if (recent.length === 0) return USUAL;
  const middle = recent[Math.floor(recent.length / 2)]!;
  return Math.min(LONGEST, Math.max(SHORTEST, Math.round(middle / 30) * 30));
}

const planned = (p: Plan) => p.dual + p.sim + p.solo;
const results = (r: GoalResult): ReqResult[] => flatten(r.sections.flatMap((s) => s.results));
const moved = (c: FlightCount) => c.before - c.after;

/** Another flight, no dearer, that does at least as much toward everything this one does. */
function dominated(flight: NextFlight, by: NextFlight): boolean {
  if (by.price > flight.price || by.saved < flight.saved) return false;
  return flight.counts.every((c) => {
    const other = by.counts.find((o) => o.id === c.id);
    return other !== undefined && moved(other) >= moved(c);
  });
}

function compare(a: NextFlight, b: NextFlight): number {
  const minutes = (f: NextFlight) => f.counts.filter((c) => c.unit === 'hours').reduce((t, c) => t + moved(c), 0);
  const closes = (f: NextFlight) => f.counts.filter((c) => c.after === 0).length;
  return b.saved - a.saved || b.counts.length - a.counts.length || closes(b) - closes(a) || minutes(b) - minutes(a) || a.price - b.price;
}

const MOST_SHOWN = 3;

/** Null when there is nothing to suggest: a goal already done, not priced, or no flight that helps. */
export function nextFlights(goal: Goal, entries: readonly Entry[], profile: Profile, today: string): NextAdvice | null {
  const now = evaluateGoal(goal, entries, profile, today);
  if (!now.plan || now.held || now.credited || now.complete) return null;
  const left = planned(now.plan);
  if (left === 0) return null;

  const total = (key: 'solo' | 'xcDual' | 'dualNight') => entries.reduce((t, e) => t + derive(e)[key], 0);
  const licensed = PILOT_LICENCE.some((id) => profile.held[id] !== undefined);
  const rates = profile.rates ?? SAMPLE_RATES;
  const log: Log = {
    licensed,
    soloed: licensed || total('solo') > 0,
    dualXc: total('xcDual'),
    dualNight: total('dualNight'),
    nightRating: profile.held.night !== undefined,
    simulator: rates.sim !== null,
  };
  // Until then the school's lessons set the order, and there is nothing to choose between.
  if (!log.soloed) return { status: 'before-solo' };

  const minutes = usualLength(entries);
  const before = results(now);
  const open = before.filter((r) => !r.met && (r.req.kind === 'time' || r.req.kind === 'count'));
  const tickOffs = before.filter((r) => !r.met && r.req.kind === 'milestone');

  const helping = FLIGHTS.filter((f) => (f.ready?.(log) ?? true) && (f.goals?.includes(goal.id) ?? true))
    .map((flight): NextFlight | null => {
      const line: Entry = { ...blankEntry(false, today), ...flight.line(minutes) };
      const after = evaluateGoal(goal, [...entries, line], profile, today);
      const saved = left - planned(after.plan!);
      // More than it lasts means the plan keeps two kinds of time apart ("on top of") that this
      // flight would log at once, so it can't really count for both.
      if (saved <= 0 || saved > minutes) return null;
      const then = new Map(results(after).map((r) => [r.req.id, r]));
      const counts = open.flatMap((r): FlightCount[] => {
        const a = then.get(r.req.id);
        if (!a) return [];
        const was = r.need - r.have;
        const is = a.met ? 0 : a.need - a.have;
        return is < was ? [{ id: r.req.id, label: r.req.label, before: was, after: is, unit: r.req.kind === 'count' ? 'landings' : 'hours' }] : [];
      });
      const plan: Plan = { dual: 0, sim: 0, solo: 0, [flight.kind]: minutes };
      return {
        id: flight.id,
        name: flight.name,
        kind: flight.kind,
        minutes,
        saved,
        counts,
        couldBe: tickOffs.filter((r) => r.req.kind === 'milestone' && flight.couldBe?.includes(r.req.key)).map((r) => r.req.label),
        price: priceOf(plan, rates).total,
        line: flight.line(minutes),
      };
    })
    .filter((f): f is NextFlight => f !== null);

  // Of two that do the same, the list above keeps the first.
  const worthShowing = helping.filter((f, i) => !helping.some((by, j) => j !== i && dominated(f, by) && (!dominated(by, f) || j < i)));
  const [best, ...others] = worthShowing.sort(compare).slice(0, MOST_SHOWN);
  return best ? { status: 'ready', best, others } : null;
}
