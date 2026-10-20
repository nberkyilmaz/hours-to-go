/**
 * One line of the logbook, with the same columns as a Canadian pilot's
 * personal log.
 *
 * The ten flight-time columns (single- and multi-engine, day and night, dual,
 * PIC and co-pilot) add up to the grand total. Cross-country and instrument
 * columns log part of that same time a second way, so they are never added
 * to the total. FTD time is instrument ground time and is not flight time.
 *
 * A line can also be "brought forward": totals copied from a paper logbook,
 * so a pilot who already has hours does not retype every flight.
 */

export const FLIGHT_COLUMNS = [
  'seDayDual',
  'seDayPic',
  'seNightDual',
  'seNightPic',
  'meDayDual',
  'meDayPic',
  'meDayCopilot',
  'meNightDual',
  'meNightPic',
  'meNightCopilot',
] as const;
export const XC_COLUMNS = ['xcDayDual', 'xcDayPic', 'xcNightDual', 'xcNightPic'] as const;
export const INSTRUMENT_COLUMNS = ['actualImc', 'hood', 'ftd'] as const;
export const TIME_COLUMNS = [...FLIGHT_COLUMNS, ...XC_COLUMNS, ...INSTRUMENT_COLUMNS] as const;
export const COUNT_COLUMNS = ['approaches', 'dayLandings', 'nightLandings'] as const;

export type FlightColumn = (typeof FLIGHT_COLUMNS)[number];
export type TimeColumn = (typeof TIME_COLUMNS)[number];
export type CountColumn = (typeof COUNT_COLUMNS)[number];
export type Column = TimeColumn | CountColumn;

/** An answer to one of the questions on a paper totals line. */
export type Answer = 'all' | 'none' | 'some';

export const AFTER_PPL_FIELDS = ['dual', 'dualNight', 'dualNightXc', 'dualXc', 'dualInst', 'ftd', 'solo', 'soloNight', 'soloNightLandings'] as const;
export type AfterPplField = (typeof AFTER_PPL_FIELDS)[number];

export const AFTER_PPL_LABEL: Record<AfterPplField, string> = {
  dual: 'Dual',
  dualNight: 'Dual at night',
  dualNightXc: 'Dual night cross-country',
  dualXc: 'Dual cross-country (day and night)',
  dualInst: 'Dual instrument (actual + hood)',
  ftd: 'FTD',
  solo: 'Solo',
  soloNight: 'Solo at night',
  soloNightLandings: 'Solo night takeoffs & landings',
};

/**
 * What a paper totals line can't show in its columns but Transport Canada
 * asks about: which PIC time was solo, and how much came after the PPL (the
 * CPL counts only training after it). Answered once, on the same line.
 */
export interface Breakdown {
  /** How much of the PIC time was solo; null until the pilot answers. */
  solo: Answer | null;
  /** Minutes, when `solo` is 'some'. */
  soloDay: number;
  soloNight: number;
  soloXc: number;
  /** How much of the line was flown after the PPL was issued; null until answered. */
  afterPpl: Answer | null;
  /** When `afterPpl` is 'some'. Minutes, landings a tally. */
  after: Record<AfterPplField, number>;
}

export function blankBreakdown(): Breakdown {
  const after = {} as Record<AfterPplField, number>;
  for (const f of AFTER_PPL_FIELDS) after[f] = 0;
  return { solo: null, soloDay: 0, soloNight: 0, soloXc: 0, afterPpl: null, after };
}

interface EntryText {
  id: string;
  /** Totals copied from a paper logbook rather than a single flight. */
  forward: boolean;
  /** YYYY-MM-DD. For a brought-forward line, the date of the last flight in it. */
  date: string;
  /** Aircraft type (C172, PA-28), or the device for an FTD session. */
  aircraft: string;
  registration: string;
  from: string;
  to: string;
  /**
   * A flight: the PIC time on it was flown alone. Paper logs keep solo inside
   * the PIC columns, but Transport Canada counts solo separately for the PPL,
   * night rating and CPL. Paper totals answer this in `breakdown` instead.
   */
  solo: boolean;
  /**
   * When a line has both solo and other night time, how many of its night
   * takeoffs and landings were solo. The paper log doesn't say, and the
   * night rating and CPL each need 10.
   */
  soloNightLandings: number;
  /** Paper totals only. */
  breakdown: Breakdown | null;
  remarks: string;
}

/** Time columns are whole minutes so sums stay exact; count columns are tallies. */
export type Entry = EntryText & Record<Column, number>;

export const COLUMN_LABEL: Record<Column, string> = {
  seDayDual: 'Dual',
  seDayPic: 'PIC',
  seNightDual: 'Dual',
  seNightPic: 'PIC',
  meDayDual: 'Dual',
  meDayPic: 'PIC',
  meDayCopilot: 'Co-pilot',
  meNightDual: 'Dual',
  meNightPic: 'PIC',
  meNightCopilot: 'Co-pilot',
  xcDayDual: 'Dual',
  xcDayPic: 'PIC',
  xcNightDual: 'Dual',
  xcNightPic: 'PIC',
  actualImc: 'Actual IMC',
  hood: 'Hood',
  ftd: 'FTD',
  approaches: 'IFR approaches',
  dayLandings: 'Day',
  nightLandings: 'Night',
};

export interface ColumnGroup {
  title: string;
  columns: readonly Column[];
}

/** The column groups, in the order a Canadian personal log prints them. */
export const LOG_GROUPS: readonly ColumnGroup[] = [
  { title: 'Single-engine day', columns: ['seDayDual', 'seDayPic'] },
  { title: 'Single-engine night', columns: ['seNightDual', 'seNightPic'] },
  { title: 'Multi-engine day', columns: ['meDayDual', 'meDayPic', 'meDayCopilot'] },
  { title: 'Multi-engine night', columns: ['meNightDual', 'meNightPic', 'meNightCopilot'] },
  { title: 'Cross-country day', columns: ['xcDayDual', 'xcDayPic'] },
  { title: 'Cross-country night', columns: ['xcNightDual', 'xcNightPic'] },
  { title: 'Instrument', columns: ['actualImc', 'hood', 'ftd', 'approaches'] },
  { title: 'Takeoffs & landings', columns: ['dayLandings', 'nightLandings'] },
];

export const isTimeColumn = (c: Column): c is TimeColumn => (TIME_COLUMNS as readonly string[]).includes(c);

/** Totals a line contributes, worked out from its columns. All minutes except the landings. */
export interface Derived {
  dual: number;
  dualNight: number;
  pic: number;
  picNight: number;
  copilot: number;
  copilotNight: number;
  /** The grand total: every flight-time column. */
  total: number;
  night: number;
  multi: number;
  solo: number;
  soloNight: number;
  soloXc: number;
  soloNightLandings: number;
  xcDual: number;
  xcPic: number;
  xcNightDual: number;
  xcNightPic: number;
  /** Actual plus hood, in the aircraft. */
  inst: number;
  /**
   * The paper log does not say whether instrument time was dual, so on a
   * line with dual time it counts as dual up to that line's dual time.
   */
  dualInst: number;
  ftd: number;
}

const derivedCache = new WeakMap<Entry, Derived>();

/** Night time on the line that wasn't PIC, so its night landings weren't all solo. */
export const mixedNight = (e: Pick<Entry, 'seNightDual' | 'meNightDual' | 'meNightCopilot'>) =>
  e.seNightDual + e.meNightDual + e.meNightCopilot > 0;

/** Solo time and solo night landings on a line. */
function soloPart(e: Entry, pic: number, picNight: number, xcPic: number) {
  const landings = (soloNight: number) =>
    soloNight === 0 ? 0 : asksSoloNightLandings(e) ? Math.min(e.soloNightLandings, e.nightLandings) : e.nightLandings;
  const b = e.forward ? e.breakdown : null;
  if (!b) {
    // A flight, or paper totals saved before the questions existed: the Solo tick box.
    return e.solo
      ? { solo: pic, soloNight: picNight, soloXc: xcPic, soloNightLandings: landings(picNight) }
      : { solo: 0, soloNight: 0, soloXc: 0, soloNightLandings: 0 };
  }
  if (b.solo === 'all') return { solo: pic, soloNight: picNight, soloXc: xcPic, soloNightLandings: landings(picNight) };
  if (b.solo === 'some') {
    const soloNight = Math.min(b.soloNight, picNight);
    return {
      solo: Math.min(b.soloDay, pic - picNight) + soloNight,
      soloNight,
      soloXc: Math.min(b.soloXc, xcPic),
      soloNightLandings: landings(soloNight),
    };
  }
  return { solo: 0, soloNight: 0, soloXc: 0, soloNightLandings: 0 };
}

/**
 * Whether the line's night landings could be partly solo and partly not, so
 * the pilot has to say how many were solo.
 */
export function asksSoloNightLandings(e: Entry): boolean {
  if (e.nightLandings === 0) return false;
  const b = e.forward ? e.breakdown : null;
  if (!b) return e.solo && mixedNight(e);
  if (b.solo === 'all') return mixedNight(e);
  return b.solo === 'some' && b.soloNight > 0;
}

/**
 * The part of a line flown on or after `pplDate`, or null when none was.
 * A flight is all one side or the other; paper totals say how much.
 */
export function afterPplPart(e: Entry, pplDate: string): Entry | null {
  if (e.date < pplDate) return null;
  const answer = e.forward ? e.breakdown?.afterPpl : 'all';
  if (answer === 'none') return null;
  if (answer !== 'some' || !e.breakdown) return e;
  const a = e.breakdown.after;
  const part = blankEntry(true, e.date);
  part.id = e.id;
  part.breakdown = null;
  part.seNightDual = a.dualNight;
  part.seDayDual = Math.max(0, a.dual - a.dualNight);
  part.xcNightDual = a.dualNightXc;
  part.xcDayDual = Math.max(0, a.dualXc - a.dualNightXc);
  part.hood = a.dualInst;
  part.ftd = a.ftd;
  part.seNightPic = a.soloNight;
  part.seDayPic = Math.max(0, a.solo - a.soloNight);
  part.solo = true;
  part.nightLandings = a.soloNightLandings;
  part.soloNightLandings = a.soloNightLandings;
  return part;
}

export function derive(e: Entry): Derived {
  const hit = derivedCache.get(e);
  if (hit) return hit;
  const dualNight = e.seNightDual + e.meNightDual;
  const dual = e.seDayDual + e.meDayDual + dualNight;
  const picNight = e.seNightPic + e.meNightPic;
  const pic = e.seDayPic + e.meDayPic + picNight;
  const copilotNight = e.meNightCopilot;
  const copilot = e.meDayCopilot + copilotNight;
  const inst = e.actualImc + e.hood;
  const xcPic = e.xcDayPic + e.xcNightPic;
  const d: Derived = {
    dual,
    dualNight,
    pic,
    picNight,
    copilot,
    copilotNight,
    total: dual + pic + copilot,
    night: dualNight + picNight + copilotNight,
    multi: e.meDayDual + e.meDayPic + e.meDayCopilot + e.meNightDual + e.meNightPic + e.meNightCopilot,
    ...soloPart(e, pic, picNight, xcPic),
    xcDual: e.xcDayDual + e.xcNightDual,
    xcPic,
    xcNightDual: e.xcNightDual,
    xcNightPic: e.xcNightPic,
    inst,
    dualInst: Math.min(inst, dual),
    ftd: e.ftd,
  };
  derivedCache.set(e, d);
  return d;
}

export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Today's date in the user's own time zone, as YYYY-MM-DD. */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function blankEntry(forward = false, date: string = today()): Entry {
  const e = {
    id: newId(),
    forward,
    date,
    aircraft: '',
    registration: '',
    from: '',
    to: '',
    solo: false,
    soloNightLandings: 0,
    breakdown: forward ? blankBreakdown() : null,
    remarks: '',
  } as Entry;
  for (const c of [...TIME_COLUMNS, ...COUNT_COLUMNS]) e[c] = 0;
  return e;
}

/**
 * Reads a duration typed the way pilots write it: decimal hours ("1.3") or
 * hours and minutes ("1:18"). Blank means zero. Returns minutes, or null when
 * the text is not a duration.
 */
export function parseDuration(text: string): number | null {
  const s = text.trim();
  if (s === '') return 0;
  const hm = /^(\d+):([0-5]\d)$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const dec = /^(\d*)(?:[.,](\d*))?$/.exec(s);
  if (dec && (dec[1] || dec[2])) {
    return Math.round(Number(`${dec[1] || '0'}.${dec[2] || '0'}`) * 60);
  }
  return null;
}

/** Minutes as decimal hours with one decimal, the way a logbook shows them. */
export function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

/** Like formatHours but never rounds a shortfall down to zero. */
export function formatHoursUp(minutes: number): string {
  return (Math.ceil(minutes / 6) / 10).toFixed(1);
}

/** Errors by field; `time` is for the line as a whole, the rest name a box or a question. */
export type ErrorKey = keyof Entry | 'time' | 'soloAnswer' | 'soloDay' | 'soloNight' | 'soloXc' | 'afterAnswer' | `after.${AfterPplField}`;
export type EntryErrors = Partial<Record<ErrorKey, string>>;

export function validateEntry(e: Entry): EntryErrors {
  const err: EntryErrors = {};
  const d = derive(e);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) err.date = 'Enter a date.';
  if (d.total === 0 && e.ftd === 0) err.time = 'Enter the time in one of the flight-time columns, or FTD time.';

  const dualDay = d.dual - d.dualNight;
  const picDay = d.pic - d.picNight;
  if (e.xcDayDual > dualDay) err.xcDayDual = 'More than the day dual time on this line.';
  if (e.xcDayPic > picDay) err.xcDayPic = 'More than the day PIC time on this line.';
  if (e.xcNightDual > d.dualNight) err.xcNightDual = 'More than the night dual time on this line.';
  if (e.xcNightPic > d.picNight) err.xcNightPic = 'More than the night PIC time on this line.';
  if (d.inst > d.total) err.hood = 'Actual plus hood is more than the flight time on this line.';

  if (!e.forward && e.solo && d.pic === 0) err.solo = 'Solo needs PIC time on this line.';
  if (asksSoloNightLandings(e) && e.soloNightLandings > e.nightLandings) {
    err.soloNightLandings = 'Can’t be more than the night takeoffs & landings on this line.';
  }
  if (e.forward && e.breakdown) Object.assign(err, validateBreakdown(e, e.breakdown, d));
  return err;
}

function validateBreakdown(e: Entry, b: Breakdown, d: Derived): EntryErrors {
  const err: EntryErrors = {};
  const over = (what: string) => `More than the ${what} in these totals.`;
  if (b.solo === 'some') {
    if (b.soloDay > d.pic - d.picNight) err.soloDay = over('day PIC time');
    if (b.soloNight > d.picNight) err.soloNight = over('night PIC time');
    if (b.soloXc > d.xcPic) err.soloXc = over('PIC cross-country');
  }
  if (b.afterPpl === 'some') {
    const a = b.after;
    const check = (f: AfterPplField, limit: number, what: string) => {
      if (a[f] > limit) err[`after.${f}`] = over(what);
    };
    check('dual', d.dual, 'dual time');
    check('dualNight', Math.min(d.dualNight, a.dual), 'dual night time');
    check('dualNightXc', Math.min(e.xcNightDual, a.dualNight), 'dual night cross-country');
    check('dualXc', d.xcDual, 'dual cross-country');
    check('dualInst', Math.min(d.dualInst, a.dual), 'dual instrument time');
    check('ftd', e.ftd, 'FTD time');
    check('solo', d.solo, 'solo time');
    check('soloNight', Math.min(d.soloNight, a.solo), 'solo night time');
    check('soloNightLandings', d.soloNightLandings, 'solo night takeoffs & landings');
    if (a.dualNightXc > a.dualXc && !err['after.dualXc']) err['after.dualXc'] = 'Include the night cross-country here too.';
  }
  return err;
}

/** A line with FTD time and no flight time: a simulator session. */
export const isFtdOnly = (e: Entry) => derive(e).total === 0 && e.ftd > 0;
