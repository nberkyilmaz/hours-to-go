/**
 * When the pilot will finish, at the pace of their last few weeks (D40): the time they have been
 * logging a week, against the time a goal's plan still needs.
 */
import { derive, type Entry } from '../model/entry';
import { dateFormat } from '../i18n';

/** Eight weeks: long enough that a fortnight of weather doesn't halve the pace, short enough to show a change. */
export const WINDOW_DAYS = 56;
/** A new student's first flights are measured over at least two weeks, so two flights in two days aren't a pace. */
const SHORTEST_DAYS = 14;
const FLIGHTS_NEEDED = 2;
/** Past this, a date means nothing. */
const LONGEST_DAYS = 5 * 365;

export interface Pace {
  /** Flight and FTD time logged a week, in minutes. */
  perWeek: number;
  /** The first day measured, YYYY-MM-DD: the window's start, or later when the log only has every flight one by one from then. */
  since: string;
  /** Whether that is the whole window. */
  whole: boolean;
}

const DAY = 86_400_000;
const dayOf = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY);
const dateOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

/**
 * The time logged a week, from flights logged one by one. Paper totals are a lump, so they never
 * count, and the flying before them can't be told apart: the pace starts after the latest. Null
 * with fewer than two flights to measure.
 */
export function paceOf(entries: readonly Entry[], today: string): Pace | null {
  const now = dayOf(today);
  const flights = entries.filter((e) => !e.forward && dayOf(e.date) <= now && derive(e).total + e.ftd > 0);
  const papers = entries.filter((e) => e.forward).map((e) => dayOf(e.date));
  const firstFlight = Math.min(...flights.map((e) => dayOf(e.date)));
  const from = Math.max(now - WINDOW_DAYS + 1, papers.length > 0 ? Math.max(...papers) + 1 : firstFlight);

  const counted = flights.filter((e) => dayOf(e.date) >= from);
  if (counted.length < FLIGHTS_NEEDED) return null;
  const minutes = counted.reduce((t, e) => t + derive(e).total + e.ftd, 0);
  const days = Math.max(now - from + 1, SHORTEST_DAYS);
  return { perWeek: (minutes * 7) / days, since: dateOf(from), whole: from === now - WINDOW_DAYS + 1 };
}

/** The day `minutes` more are flown at this pace, YYYY-MM-DD; null when that is more than five years away. */
export function finishOn(minutes: number, pace: Pace, today: string): string | null {
  const days = Math.ceil((minutes / pace.perWeek) * 7);
  return days > LONGEST_DAYS ? null : dateOf(dayOf(today) + days);
}

const MONTH: Intl.DateTimeFormatOptions = { month: 'long', timeZone: 'UTC' };
const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric', timeZone: 'UTC' };
const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' };

/** "March", or "March 2027" outside this year: a finish is only ever about a month. */
export function monthText(date: string, today: string): string {
  const d = new Date(dayOf(date) * DAY);
  return dateFormat(date.slice(0, 4) === today.slice(0, 4) ? MONTH : MONTH_YEAR).format(d);
}

/** "October 22", for when the pace was measured from. */
export const dayText = (date: string) => dateFormat(DAY_MONTH).format(new Date(dayOf(date) * DAY));
