/**
 * How far along a goal is, for the ring at the top of Progress (D47). By hours flown, not by
 * requirements ticked: a student with 58% of their hours flown isn't a quarter of the way there.
 */
import { evaluateGoal, type GoalResult } from './evaluate';
import type { Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import type { Goal } from './goals';

export interface GoalProgress {
  /** Minutes. The most the goal could need: the same figure, with nothing logged. */
  need: number;
  left: number;
  flown: number;
  percent: number;
}

/** The plan the price and the finish date are for, or D4's figure when that's larger (Class 4's prerequisites). */
const toGo = (r: GoalResult) => Math.max(r.minutesToGo, r.plan ? r.plan.dual + r.plan.sim + r.plan.solo : 0);

export function progressOf(now: GoalResult, atStart: GoalResult): GoalProgress {
  const need = toGo(atStart);
  const left = Math.min(toGo(now), need);
  const flown = need - left;
  if (now.held || now.credited) return { need, left: 0, flown: need, percent: 100 };
  // A goal with no hours in it (the multi-engine rating) can only go by what's ticked.
  const percent = need > 0 ? Math.round((flown / need) * 100) : Math.round((now.done / Math.max(1, now.total)) * 100);
  return { need, left, flown, percent: now.complete ? 100 : Math.min(percent, 99) };
}

export const goalProgress = (goal: Goal, entries: readonly Entry[], profile: Profile, today: string): GoalProgress =>
  progressOf(evaluateGoal(goal, entries, profile, today), evaluateGoal(goal, [], profile, today));
