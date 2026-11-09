/**
 * What an instructor sees through a read-only link (D56). It's worked out on the server and only these figures are
 * sent, never logbook lines, marks or dates, so what a link can show is decided here and nowhere else.
 */
import type { Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import { evaluateGoal, type ReqResult } from './evaluate';
import { goalById } from './goals';
import { progressOf } from './progress';

export interface SharedLine {
  label: string;
  cite: string;
  met: boolean;
  /** Minutes for hours, a tally for a count; null when it's only done or not done. */
  have: number | null;
  need: number | null;
  unit: 'hours' | 'count' | null;
  /** How far it's nested under the line above: "…including…". */
  depth: number;
}

export interface SharedProgress {
  /** What the pilot chose to be called on this link. */
  name: string;
  goal: string;
  percent: number;
  /** Minutes still to fly, at the least. */
  left: number;
  complete: boolean;
  sections: { title: string; lines: SharedLine[] }[];
  asOf: string;
  /** Milliseconds: when the link stops working. */
  expiresAt: number;
}

function linesOf(r: ReqResult, depth: number): SharedLine[] {
  const { req } = r;
  if (req.kind === 'info') return [];
  const measured = req.kind === 'time' || req.kind === 'count';
  const line: SharedLine = {
    label: req.label,
    cite: req.cite,
    met: r.met,
    have: measured ? r.have : null,
    need: measured ? r.need : null,
    unit: req.kind === 'time' ? 'hours' : req.kind === 'count' ? 'count' : null,
    depth,
  };
  return [line, ...r.children.flatMap((c) => linesOf(c, depth + 1))];
}

/** The goal the pilot is working on now, so the link stays current without a new one. */
export function sharedProgress(entries: readonly Entry[], profile: Profile, today: string, name: string, expiresAt: number): SharedProgress {
  const goal = goalById(profile.focus);
  const now = evaluateGoal(goal, entries, profile, today);
  const progress = progressOf(now, evaluateGoal(goal, [], profile, today));
  return {
    name,
    goal: goal.name,
    percent: progress.percent,
    left: progress.left,
    complete: progress.percent === 100,
    sections: now.sections.map((s) => ({ title: s.section.title, lines: s.results.flatMap((r) => linesOf(r, 0)) })).filter((s) => s.lines.length > 0),
    asOf: today,
    expiresAt,
  };
}
