import { TIME_COLUMNS, blankBreakdown, blankEntry, type Breakdown, type Entry, type TimeColumn } from '../../src/model/entry';
import { blankProfile, type Profile } from '../../src/model/profile';

type Hours = Partial<Record<TimeColumn, number>>;

/** A logbook line with its time columns given in hours, the way a test reads best. */
export function line(date: string, hours: Hours, extra: Partial<Entry> = {}): Entry {
  const e = { ...blankEntry(false, date), ...extra };
  for (const c of TIME_COLUMNS) {
    const v = hours[c];
    if (v !== undefined) e[c] = Math.round(v * 60);
  }
  return e;
}

type Answers = Partial<Omit<Breakdown, 'after'>> & { after?: Partial<Breakdown['after']> };

/** Paper totals with their questions answered; times in hours like `line`, landings as counts. */
export function totals(date: string, hours: Hours, answers: Answers = {}, extra: Partial<Entry> = {}): Entry {
  const b: Breakdown = { ...blankBreakdown(), ...answers, after: blankBreakdown().after };
  for (const k of ['soloDay', 'soloNight', 'soloXc'] as const) b[k] = Math.round((answers[k] ?? 0) * 60);
  for (const [k, v] of Object.entries(answers.after ?? {})) {
    b.after[k as keyof Breakdown['after']] = k === 'soloNightLandings' ? v : Math.round(v * 60);
  }
  return line(date, hours, { forward: true, breakdown: b, ...extra });
}

export function profile(change: Partial<Profile> = {}): Profile {
  return { ...blankProfile(), ...change };
}
