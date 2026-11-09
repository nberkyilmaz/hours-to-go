/**
 * What's about to run out, for the reminder emails (D53). It comes from the same rules as the screen, so an email
 * can't disagree with Progress.
 */
import type { Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import { currencyOf } from './currency';
import { evaluateGoal, flatten } from './evaluate';
import { GOALS } from './goals';

export interface Due {
  key: string;
  what: string;
  /** The last day it holds. */
  until: string;
  daysLeft: number;
  /** How many days before `until` a reminder goes out. */
  steps: readonly number[];
}

const STEPS = [30, 7];
/** A letter lasts 30 or 60 days, so a month's notice could arrive the day it's dated. */
const LETTER_STEPS = [7];

const CURRENCY_NAMES: Record<string, string> = {
  recurrent: 'Recurrent training',
  'ifr-check': 'Instrument flight test or proficiency check',
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Soonest first: what has a date, hasn't run out, and is close enough for its first reminder. */
export function comingUp(entries: readonly Entry[], profile: Profile, today: string): Due[] {
  const found = new Map<string, Due>();
  const add = (key: string, what: string, until: string, steps: readonly number[] = STEPS) => {
    const daysLeft = daysBetween(today, until);
    if (daysLeft >= 0 && daysLeft <= Math.max(...steps)) found.set(key, { key, what, until, daysLeft, steps });
  };
  if (profile.medical !== 'none' && profile.medicalUntil !== '') add('medical', 'Your medical certificate', profile.medicalUntil);
  // Every goal, because a date is only there if the pilot entered it, and a key is only reminded of once.
  for (const goal of GOALS) {
    for (const r of flatten(evaluateGoal(goal, entries, profile, today).sections.flatMap((s) => s.results))) {
      if (r.req.kind === 'milestone' && r.met && r.credited === null && r.until) {
        add(r.req.key, r.req.label.split(/:|, within/)[0]!, r.until, r.req.maxAgeDays === undefined ? STEPS : LETTER_STEPS);
      }
    }
  }
  for (const c of currencyOf(entries, profile, today) ?? []) {
    const what = CURRENCY_NAMES[c.id];
    if (what && c.current && c.until) add(c.id, what, c.until);
  }
  return [...found.values()].sort((a, b) => a.daysLeft - b.daysLeft);
}

/**
 * What hasn't been said yet, and the marks to remember once it has. A mark carries the date, so a renewed medical
 * starts over. Coming up late, every step already passed is marked at once, so one email covers them.
 */
export function toSend(due: readonly Due[], sent: ReadonlySet<string>): { items: Due[]; marks: string[] } {
  const items: Due[] = [];
  const marks: string[] = [];
  for (const d of due) {
    const reached = d.steps.filter((s) => d.daysLeft <= s).map((s) => `${d.key}|${d.until}|${s}`);
    if (reached.some((m) => !sent.has(m))) {
      items.push(d);
      marks.push(...reached);
    }
  }
  return { items, marks };
}
