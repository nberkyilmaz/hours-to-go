/** Finding a flight, and laying the logbook out by month (D48). */
import { derive, type Entry } from './entry';
import { dateFormat, t } from '../i18n';

export type LogFilter = 'all' | 'dual' | 'solo' | 'night' | 'xc' | 'ftd';

export const LOG_FILTERS: { id: LogFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'dual', label: 'Dual' },
  { id: 'solo', label: 'Solo' },
  { id: 'night', label: 'Night' },
  { id: 'xc', label: 'Cross-country' },
  { id: 'ftd', label: 'FTD' },
];

function kept(e: Entry, filter: LogFilter): boolean {
  const d = derive(e);
  switch (filter) {
    case 'all':
      return true;
    case 'dual':
      return d.dual > 0;
    case 'solo':
      return d.solo > 0;
    case 'night':
      return d.night > 0;
    case 'xc':
      return d.xcDual + d.xcPic > 0;
    case 'ftd':
      return e.ftd > 0;
  }
}

/** Every word typed must be somewhere on the line, in any order. */
export function matches(e: Entry, query: string, filter: LogFilter): boolean {
  if (!kept(e, filter)) return false;
  const line = [e.date, e.aircraft, e.registration, e.from, e.to, e.remarks].join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => line.includes(word));
}

export interface LogMonth {
  key: string;
  label: string;
  entries: Entry[];
  /** Flight time in the month. */
  minutes: number;
}

const UTC = (date: string) => new Date(`${date}T00:00:00Z`);
const MONTH: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric', timeZone: 'UTC' };
/** French writes "octobre 2026" in lower case, but this is a heading. */
const capital = (s: string) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
const DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };

/** Newest first, as the list is given. */
export function byMonth(sorted: readonly Entry[]): LogMonth[] {
  const months = new Map<string, LogMonth>();
  // Paper totals go last under a heading of their own: they carry a date, but weren't flown in that month.
  for (const e of [...sorted.filter((x) => !x.forward), ...sorted.filter((x) => x.forward)]) {
    const key = e.forward ? 'forward' : e.date.slice(0, 7);
    const month = months.get(key) ?? { key, label: e.forward ? t('Brought forward') : capital(dateFormat(MONTH).format(UTC(`${key}-01`))), entries: [], minutes: 0 };
    month.entries.push(e);
    month.minutes += derive(e).total;
    months.set(key, month);
  }
  return [...months.values()];
}

/** "Nov 8", the month's header giving the year. */
export const shortDate = (date: string) => dateFormat(DAY).format(UTC(date));
