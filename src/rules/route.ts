/**
 * A goal drawn as a flight plan (D60). The aircraft sits at the ring's own figure, so the two can't disagree, with the
 * flight test marked where its hours come.
 */
import type { GateResult, GoalResult } from './evaluate';
import type { TimeReq } from './goals';
import type { GoalProgress } from './progress';

export interface Fix {
  /** How far along the line, from 0 to 1. */
  at: number;
  passed: boolean;
}

export interface FlightPlan {
  percent: number;
  fixes: Fix[];
  /** The next step the standard lets a pilot unlock. */
  next: GateResult | null;
}

/** Null once there's nowhere left to go: the goal is held, covered, or finished. */
export function routeOf(r: GoalResult, progress: GoalProgress): FlightPlan | null {
  if (r.held || r.credited || r.complete) return null;
  const fixes = r.gates.flatMap((g): Fix[] => {
    if (!g.gate.test || g.gate.needs === 'knowledge-and-experience' || progress.need === 0) return [];
    const hours = g.gate.needs.find((n): n is TimeReq => n.kind === 'time');
    return hours ? [{ at: Math.min(1, (hours.need * 60) / progress.need), passed: g.passed }] : [];
  });
  return { percent: progress.percent, fixes, next: r.gates.find((g) => !g.passed) ?? null };
}
