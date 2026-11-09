/**
 * A goal drawn as a flight plan: one leg for each part of the standard (D60). The legs come from the goal's own
 * sections, so it needs nothing written for any one licence.
 */
import type { GoalResult, ReqResult, SectionResult } from './evaluate';

export interface Leg {
  title: string;
  done: number;
  total: number;
  /** How far along the leg, from 0 to 1. */
  part: number;
  complete: boolean;
}

/** Hours are most of an experience leg, so they move the aircraft; a leg with none goes by what's been ticked. */
function partOf(results: readonly ReqResult[], done: number): number {
  const timed = results.filter((r) => r.req.kind === 'time');
  const need = timed.reduce((sum, r) => sum + r.need, 0);
  if (need > 0) return timed.reduce((sum, r) => sum + Math.min(r.have, r.need), 0) / need;
  return done / results.length;
}

function legOf({ section, results }: SectionResult): Leg | null {
  const counted = results.filter((r) => r.req.kind !== 'info');
  if (counted.length === 0) return null;
  const done = counted.filter((r) => r.met).length;
  const complete = done === counted.length;
  return { title: section.title, done, total: counted.length, part: complete ? 1 : partOf(counted, done), complete };
}

/** Null once there's nowhere left to go: the goal is held, covered, or finished. */
export function routeOf(r: GoalResult): Leg[] | null {
  if (r.held || r.credited || r.complete) return null;
  const legs = r.sections.map(legOf).filter((leg): leg is Leg => leg !== null);
  return legs.some((leg) => !leg.complete) ? legs : null;
}
