/**
 * Whether a licensed pilot is current to fly (CAR 401.05, D52). It keeps the logbook useful after the
 * licence, when the requirements stop being "how much is left" and become "is it still recent".
 */
import { addMonths, dateText, derive, type Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import { GOALS, PILOT_LICENCE } from './goals';
import { medicalEnd } from './medical';
import { shortName, t } from '../i18n';

export interface CurrencyItem {
  id: string;
  label: string;
  cite: string;
  current: boolean;
  /** The last day it holds, when that can be worked out. */
  until: string | null;
  /** What's missing, or when it starts to apply: "3 of 5 in the last 6 months". */
  note: string | null;
  /** A milestone date the pilot enters here, when the log can't show it. */
  dateKey?: string;
  /** Where the date it counts from came from, when it wasn't entered here: "Counted from your PPL flight test, …". */
  from?: string | null;
  /** Counts takeoffs and landings, which the pilot can add from the paper log (D70). */
  landings?: boolean;
  /** About the medical, which can be set here. */
  medical?: boolean;
}

const LANDINGS = 5;
const APPROACHES = 6;
export const RECURRENT_KEY = 'recurrent-training';
export const IFR_CHECK_KEY = 'ifr-check';

const latest = (dates: readonly (string | undefined)[]) => dates.filter((d): d is string => !!d).sort().at(-1) ?? null;

/** Something with a date that counts toward a recency rule. */
interface Dated {
  date: string;
  day: number;
  night: number;
  multi: boolean;
  approaches: number;
}

/** Newest first: only lines with a date of their own, since paper totals can't show when a landing was. */
const flights = (entries: readonly Entry[], today: string) =>
  entries.filter((e) => !e.forward && e.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));

/** The day of the newest paper totals: the takeoffs and landings the pilot dates for us are inside them. */
export const lastTotals = (entries: readonly Entry[]) => latest(entries.filter((e) => e.forward).map((e) => e.date));

/**
 * Takeoffs and landings with a date: flights logged one by one in an aircraft, and the lines the pilot copied from the
 * paper log. Those count up to the newest paper totals, since after that day the flights are in the app itself.
 */
export function landed(entries: readonly Entry[], profile: Profile, today: string): Dated[] {
  const own = flights(entries, today)
    .filter((e) => derive(e).total > 0)
    .map((e) => ({ date: e.date, day: e.dayLandings, night: e.nightLandings, multi: derive(e).multi > 0, approaches: e.approaches }));
  const upTo = lastTotals(entries);
  const copied = upTo === null ? [] : profile.landings.filter((l) => l.date <= upTo && l.date <= today).map((l) => ({ ...l, approaches: 0 }));
  return [...own, ...copied].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Enough of something in the last 6 months, and the day that stops being true. */
function recent(id: string, label: string, cite: string, lines: readonly Dated[], need: number, count: (d: Dated) => number, today: string): CurrencyItem {
  let total = 0;
  let until: string | null = null;
  for (const e of lines) {
    // Counted forward from the flight, the same way as the date it runs out: back from today, they disagree at a month's end.
    const lasts = addMonths(e.date, 6);
    if (today > lasts) break;
    total += count(e);
    if (total >= need) {
      until = lasts;
      break;
    }
  }
  const current = until !== null;
  return { id, label, cite, current, until, note: current ? null : t('{total} of {need} in the last 6 months', { total, need }) };
}

/** What the latest recurrent-training date is, and where it came from when it wasn't entered as such. */
function recurrentFrom(profile: Profile): { date: string | null; from: string | null } {
  const name = (id: string) => {
    const goal = GOALS.find((g) => g.id === id);
    return goal ? shortName(goal.short) : id;
  };
  const sources: { date: string; from: string | null }[] = [
    ...Object.entries(profile.milestones)
      .filter(([k, r]) => k.startsWith('test-') && r.date)
      .map(([k, r]) => ({ date: r.date, from: t('Counted from your {goal} flight test, {date}.', { goal: name(k.slice(5)), date: dateText(r.date) }) })),
    ...Object.entries(profile.held)
      .filter(([, h]) => h?.date)
      .map(([id, h]) => ({ date: h!.date, from: t('Counted from your {goal}, issued {date}.', { goal: name(id), date: dateText(h!.date) }) })),
  ];
  const entered = profile.milestones[RECURRENT_KEY]?.date;
  if (entered) sources.push({ date: entered, from: null });
  const newest = sources.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.from === null ? -1 : 1))[0];
  return newest ? { date: newest.date, from: newest.from } : { date: null, from: null };
}

/** The medical, for the privileges of the licences held (CAR 404.04, D70). */
function medicalItems(profile: Profile, today: string): CurrencyItem[] {
  const base = { cite: '404.04', medical: true };
  if (profile.medical === 'none' || (!profile.medicalExam && !profile.medicalUntil)) {
    return [{ ...base, id: 'medical', label: t('Medical certificate'), current: false, until: null, note: t('Add your medical: its category and the date of the exam.') }];
  }
  const item = (id: string, label: string, privileges: 'commercial' | 'private', needs: string): CurrencyItem => {
    const until = medicalEnd(profile, privileges);
    if (until === null) return { ...base, id, label, current: false, until: null, note: needs };
    return { ...base, id, label, current: today <= until, until, note: null };
  };
  const items: CurrencyItem[] = [];
  if (profile.held.cpl || profile.held.atpl) {
    items.push(item('medical-commercial', t('Medical certificate for commercial flying'), 'commercial', t('Commercial privileges need a Category 1 medical.')));
  }
  items.push(item('medical', t('Medical certificate for private flying'), 'private', t('A pilot licence needs a Category 3 or Category 1 medical.')));
  return items;
}

/** Null unless the pilot holds a licence: until then, currency isn't the question. */
export function currencyOf(entries: readonly Entry[], profile: Profile, today: string): CurrencyItem[] | null {
  if (!PILOT_LICENCE.some((id) => profile.held[id] !== undefined)) return null;
  const items: CurrencyItem[] = [];
  const lines = flights(entries, today);

  // Paper totals carry the date of their last flight, so they can show this much.
  const lastFlown = latest(entries.filter((e) => e.date <= today && derive(e).pic + derive(e).copilot > 0).map((e) => e.date));
  const fiveYears = lastFlown ? addMonths(lastFlown, 60) : null;
  items.push({
    id: 'five-years',
    label: t('Flown as pilot-in-command or co-pilot in the last 5 years'),
    cite: '401.05(1)(a)',
    current: fiveYears !== null && today <= fiveYears,
    until: fiveYears,
    note: lastFlown ? null : t('No flight in your log yet'),
  });

  items.push(...medicalItems(profile, today));

  // Issuing or renewing any licence or rating counts as recurrent training (421.05(2)(f)).
  const recurrent = recurrentFrom(profile);
  const recurrentUntil = recurrent.date ? addMonths(recurrent.date, 24) : null;
  items.push({
    id: 'recurrent',
    label: t('Recurrent training in the last 24 months'),
    cite: '401.05(2)(a)',
    current: recurrentUntil !== null && today <= recurrentUntil,
    until: recurrentUntil,
    note: recurrent.date ? null : t('Add the date of your last recurrent training'),
    dateKey: RECURRENT_KEY,
    from: recurrent.from,
  });

  // The takeoffs and landings have to be in the same class as the aircraft carrying the passengers.
  // A simulator only counts at Level B, C or D, and the log's one column can't say which it was.
  const dated = landed(entries, profile, today);
  const single = dated.filter((d) => !d.multi);
  const multi = dated.filter((d) => d.multi);
  const fromPaper = lastTotals(entries) !== null;
  // Without a night rating or any night flying, the night row would only be an alarm about nothing.
  const atNight = (['night', 'cpl', 'atpl'] as const).some((id) => profile.held[id] !== undefined) || entries.some((e) => e.nightLandings > 0 || derive(e).night > 0);
  const passengers = (suffix: string, name: string, of: readonly Dated[]) => {
    items.push({ ...recent(`passengers-day${suffix}`, t('Passengers by day{class}: 5 takeoffs and landings in 6 months', { class: name }), '401.05(2)(b)', of, LANDINGS, (d) => d.day + d.night, today), landings: fromPaper });
    if (atNight) items.push({ ...recent(`passengers-night${suffix}`, t('Passengers at night{class}: 5 night takeoffs and landings in 6 months', { class: name }), '401.05(2)(b)', of, LANDINGS, (d) => d.night, today), landings: fromPaper });
  };
  const anyMulti = profile.held.multi !== undefined || multi.length > 0;
  passengers('', anyMulti ? t(', single-engine') : '', single);
  if (anyMulti) passengers('-multi', t(', multi-engine'), multi);

  const rating = profile.held.ifr1 ?? profile.held.ifr3;
  if (rating) {
    const check = latest([profile.milestones[IFR_CHECK_KEY]?.date, profile.held.ifr1?.date, profile.held.ifr3?.date]);
    const checkUntil = check ? addMonths(check, 24) : null;
    items.push({
      id: 'ifr-check',
      label: t('Instrument flight test or proficiency check in the last 24 months'),
      cite: '401.05(3)',
      current: checkUntil !== null && today <= checkUntil,
      until: checkUntil,
      note: check ? null : t('Add the date of your last test or check'),
      dateKey: IFR_CHECK_KEY,
    });
    // Until the first day of the seventh month after the check, the check itself is enough.
    const seventh = check ? `${addMonths(check, 7).slice(0, 7)}-01` : null;
    const flownApproaches: Dated[] = lines.map((e) => ({ date: e.date, day: 0, night: 0, multi: false, approaches: e.approaches }));
    const approaches = recent('ifr-approaches', t('6 instrument approaches in 6 months'), '401.05(3.1)', flownApproaches, APPROACHES, (d) => d.approaches, today);
    if (seventh && today < seventh) items.push({ ...approaches, current: true, until: null, note: t('Needed from {date}', { date: dateText(seventh) }) });
    else items.push(approaches);
  }
  return items;
}
