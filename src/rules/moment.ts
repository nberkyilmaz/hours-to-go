/**
 * What logging a flight just did for the goal the pilot is working on (D46). Saving is the one
 * moment the app can give something back, and the rules already know the answer.
 */
import { derive, type Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import { evaluateGoal, flatten, type GoalResult, type ReqResult } from './evaluate';
import type { Goal } from './goals';
import { goalProgress } from './progress';

export interface Moment {
  short: string;
  /** Least flying left, in minutes, before and after. */
  was: number;
  now: number;
  /** Hour and landing requirements this flight finished. */
  finished: string[];
  /** The flight finished the whole goal. */
  complete: boolean;
  firstSolo: boolean;
  /** The flight took the goal past half way. */
  halfway: boolean;
}

const results = (r: GoalResult): ReqResult[] => flatten(r.sections.flatMap((s) => s.results));
const counted = (r: ReqResult) => r.req.kind === 'time' || r.req.kind === 'count';

/** Null when the goal is already held or covered: a flight changes nothing there. */
export function momentOf(goal: Goal, entries: readonly Entry[], flight: Entry, profile: Profile, today: string): Moment | null {
  const before = evaluateGoal(goal, entries, profile, today);
  if (before.held || before.credited) return null;
  const after = evaluateGoal(goal, [...entries, flight], profile, today);
  const metBefore = new Set(results(before).filter((r) => r.met).map((r) => r.req.id));
  const percent = (log: readonly Entry[]) => goalProgress(goal, log, profile, today).percent;
  return {
    short: goal.short,
    was: before.minutesToGo,
    now: after.minutesToGo,
    finished: results(after)
      .filter((r) => counted(r) && r.met && !metBefore.has(r.req.id))
      .map((r) => r.req.label),
    complete: after.complete && !before.complete,
    firstSolo: derive(flight).solo > 0 && !entries.some((e) => derive(e).solo > 0),
    halfway: percent(entries) < 50 && percent([...entries, flight]) >= 50,
  };
}
