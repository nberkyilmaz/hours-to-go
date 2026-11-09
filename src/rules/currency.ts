/**
 * Whether a licensed pilot is current to fly (CAR 401.05, D52). It keeps the logbook useful after the
 * licence, when the requirements stop being "how much is left" and become "is it still recent".
 */
import { addMonths, dateText, derive, type Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import { PILOT_LICENCE } from './goals';
import { t } from '../i18n';

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
}

const LANDINGS = 5;
const APPROACHES = 6;
export const RECURRENT_KEY = 'recurrent-training';
export const IFR_CHECK_KEY = 'ifr-check';

const latest = (dates: readonly (string | undefined)[]) => dates.filter((d): d is string => !!d).sort().at(-1) ?? null;

/** Newest first: only lines with a date of their own, since paper totals can't show when a landing was. */
const flights = (entries: readonly Entry[], today: string) =>
  entries.filter((e) => !e.forward && e.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));

/** Enough of something in the last 6 months, and the day that stops being true. */
function recent(id: string, label: string, cite: string, lines: readonly Entry[], need: number, count: (e: Entry) => number, today: string): CurrencyItem {
  const from = addMonths(today, -6);
  let total = 0;
  let until: string | null = null;
  for (const e of lines) {
    if (e.date < from) break;
    total += count(e);
    if (total >= need) {
      until = addMonths(e.date, 6);
      break;
    }
  }
  const current = until !== null;
  return { id, label, cite, current, until, note: current ? null : t('{total} of {need} in the last 6 months', { total, need }) };
}

/** Null unless the pilot holds a licence: until then, currency isn't the question. */
export function currencyOf(entries: readonly Entry[], profile: Profile, today: string): CurrencyItem[] | null {
  if (!PILOT_LICENCE.some((id) => profile.held[id] !== undefined)) return null;
  const items: CurrencyItem[] = [];
  const lines = flights(entries, today);
  const landings = (e: Entry) => e.dayLandings + e.nightLandings;

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

  // Issuing or renewing any licence or rating counts as recurrent training (421.05(2)(f)).
  const tests = Object.entries(profile.milestones).filter(([k]) => k.startsWith('test-') || k === RECURRENT_KEY).map(([, r]) => r.date);
  const recurrent = latest([...tests, ...Object.values(profile.held).map((h) => h?.date)]);
  const recurrentUntil = recurrent ? addMonths(recurrent, 24) : null;
  items.push({
    id: 'recurrent',
    label: t('Recurrent training in the last 24 months'),
    cite: '401.05(2)(a)',
    current: recurrentUntil !== null && today <= recurrentUntil,
    until: recurrentUntil,
    note: recurrent ? null : t('Add the date of your last recurrent training'),
    dateKey: RECURRENT_KEY,
  });

  // The takeoffs and landings have to be in the same class as the aircraft carrying the passengers.
  // A simulator only counts at Level B, C or D, and the log's one column can't say which it was.
  const flown = lines.filter((e) => derive(e).total > 0);
  const single = flown.filter((e) => derive(e).multi === 0);
  const multi = flown.filter((e) => derive(e).multi > 0);
  const passengers = (suffix: string, name: string, of: readonly Entry[]) => {
    items.push(recent(`passengers-day${suffix}`, t('Passengers by day{class}: 5 takeoffs and landings in 6 months', { class: name }), '401.05(2)(b)', of, LANDINGS, landings, today));
    items.push(recent(`passengers-night${suffix}`, t('Passengers at night{class}: 5 night takeoffs and landings in 6 months', { class: name }), '401.05(2)(b)', of, LANDINGS, (e) => e.nightLandings, today));
  };
  passengers('', profile.held.multi || multi.length > 0 ? t(', single-engine') : '', single);
  if (profile.held.multi || multi.length > 0) passengers('-multi', t(', multi-engine'), multi);

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
    const approaches = recent('ifr-approaches', t('6 instrument approaches in 6 months'), '401.05(3.1)', lines, APPROACHES, (e) => e.approaches, today);
    if (seventh && today < seventh) items.push({ ...approaches, current: true, until: null, note: t('Needed from {date}', { date: dateText(seventh) }) });
    else items.push(approaches);
  }
  return items;
}
