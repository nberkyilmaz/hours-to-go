import { afterPplPart, today as todayDate, type Entry } from '../model/entry';
import type { MilestoneRecord, Profile } from '../model/profile';
import { examCheck, goalById, passed, type Ctx, type Gate, type Goal, type Req, type Section } from './goals';

export interface ReqResult {
  req: Req;
  met: boolean;
  credited: string | null;
  /** Minutes for time requirements, a tally for counts, 0 otherwise. */
  have: number;
  /** Same unit as `have`. */
  need: number;
  record: MilestoneRecord | null;
  /** An exam mark was entered and it is under the pass mark. */
  scoreLow: boolean;
  /** For an info row, the figure; for a licence or rating held, what satisfies it. */
  value: string | null;
  /** While unmet: time in the log that may belong here but isn't counted. */
  hint: string | null;
  /** A dated item (a recommendation letter) that is too old to count any more. */
  stale: boolean;
  /** For a written exam: whether Transport Canada would let you write it yet. */
  exam: ExamResult | null;
  children: ReqResult[];
}

export interface ExamResult {
  name: string;
  /** Every condition for writing it is met. */
  ready: boolean;
  passed: boolean;
  checks: ReqResult[];
}

export interface SectionResult {
  section: Section;
  results: ReqResult[];
}

export interface GateResult {
  gate: Gate;
  met: boolean;
  /** The exams this gate leads to are all passed. */
  passed: boolean;
  /** What is still in the way, flattened. */
  open: ReqResult[];
}

export interface ScopeInfo {
  start: string | null;
  /** Shown when the window cannot be worked out yet. */
  message: string | null;
}

export interface GoalResult {
  goal: Goal;
  held: { date: string } | null;
  credited: string | null;
  scope: ScopeInfo | null;
  sections: SectionResult[];
  gates: GateResult[];
  done: number;
  total: number;
  /**
   * The largest single shortfall among the hour requirements, in minutes.
   * One flight can count toward several requirements at once, so this is the
   * least flying left, not a sum.
   */
  minutesToGo: number;
  complete: boolean;
}

function resolveScope(goal: Goal, profile: Profile): ScopeInfo | null {
  if (!goal.scope) return null;
  const override = profile.trainingStart[goal.id];
  if (override) return { start: override, message: null };
  if (goal.scope.from === 'manual') {
    return { start: null, message: 'Set the date your course started to count this training.' };
  }
  const ppl = profile.held.ppl;
  if (!ppl) return { start: null, message: 'This starts counting once you hold your PPL.' };
  if (!ppl.date) return { start: null, message: 'Add your PPL issue date in Profile. Until then every flight is counted, including PPL training.' };
  return { start: ppl.date, message: null };
}

/**
 * The entries a scoped section counts. CPL training is what came after the
 * PPL: whole flights by date, and for paper totals the part the pilot said
 * was after it.
 */
function scopedEntries(entries: readonly Entry[], goal: Goal, scope: ScopeInfo | null, profile: Profile): { entries: readonly Entry[]; note: string | null } {
  if (!scope) return { entries, note: null };
  if (goal.scope?.from === 'ppl' && (scope.start || profile.held.ppl)) {
    const start = scope.start ?? '';
    const unanswered = entries.filter((e) => e.forward && e.date >= start && !e.breakdown?.afterPpl);
    const note = unanswered.length
      ? `Your paper totals up to ${unanswered.map((e) => e.date).join(', ')} don’t say how much was flown after your PPL, so all of it counts here. Edit that line in the Logbook to answer.`
      : null;
    return { entries: entries.map((e) => afterPplPart(e, start)).filter((e): e is Entry => e !== null), note };
  }
  if (scope.start) {
    const start = scope.start;
    return { entries: entries.filter((e) => e.date >= start), note: null };
  }
  return { entries: [], note: null };
}

const daysSince = (date: string, today: string) => Math.floor((Date.parse(today) - Date.parse(date)) / 86_400_000);

/**
 * `goal` is the goal's own context. A section outside the training window
 * sees the whole log, but an exam's conditions (the AIRAF's share of
 * instructor training) are always judged on the real window.
 */
function evalReq(req: Req, c: Ctx, goal: Ctx = c): ReqResult {
  const children = (req.sub ?? []).map((s) => evalReq(s, c, goal));
  const credited = req.credit?.(c) ?? null;
  const base: ReqResult = {
    req,
    met: false,
    credited,
    have: 0,
    need: 0,
    record: null,
    scoreLow: false,
    value: null,
    hint: null,
    stale: false,
    exam: null,
    children,
  };
  const withHint = (r: ReqResult): ReqResult => (r.met || !req.hint ? r : { ...r, hint: req.hint(c) });
  switch (req.kind) {
    case 'time': {
      const have = req.have(c);
      const need = req.need * 60;
      return withHint({ ...base, have, need, met: credited !== null || have >= need });
    }
    case 'count': {
      const have = req.have(c);
      return withHint({ ...base, have, need: req.need, met: credited !== null || have >= req.need });
    }
    case 'milestone': {
      const record = c.profile.milestones[req.key] ?? null;
      const scoreLow = record?.score !== undefined && req.minScore !== undefined && record.score < req.minScore;
      const stale = record !== null && req.maxAgeDays !== undefined && record.date !== '' && daysSince(record.date, c.today) > req.maxAgeDays;
      const check = examCheck(req.key);
      const exam: ExamResult | null = check
        ? (() => {
            const checks = check.needs.map((n) => evalReq(n, goal));
            return { name: check.name, ready: checks.every((r) => r.met), passed: passed(c, check.key, check.minScore), checks };
          })()
        : null;
      return { ...base, record, scoreLow, stale, exam, met: credited !== null || (record !== null && !scoreLow && !stale) };
    }
    case 'held': {
      const id = req.anyOf.find((g) => c.profile.held[g] !== undefined);
      if (id === undefined) return base;
      const date = c.profile.held[id]?.date;
      return { ...base, met: true, value: `You hold the ${goalById(id).name}${date ? `, since ${date}` : ''}.` };
    }
    case 'medical':
      return { ...base, met: req.anyOf.includes(c.profile.medical) };
    case 'info':
      return { ...base, met: true, value: req.value(c) };
  }
}

function flatten(results: readonly ReqResult[]): ReqResult[] {
  return results.flatMap((r) => [r, ...flatten(r.children)]);
}

const counts = (r: ReqResult) => r.req.kind !== 'info';

export function evaluateGoal(goal: Goal, entries: readonly Entry[], profile: Profile, today: string = todayDate()): GoalResult {
  const resolved = resolveScope(goal, profile);
  const scoped = scopedEntries(entries, goal, resolved, profile);
  const scope = resolved && scoped.note ? { ...resolved, message: [resolved.message, scoped.note].filter(Boolean).join(' ') } : resolved;
  const c: Ctx = { all: entries, scoped: scoped.entries, profile, today };
  // A scoped section can't be judged without its window, so it gets an empty
  // window rather than the whole log; unscoped sections always see everything.
  const sections = goal.sections.map((section) => ({
    section,
    results: section.reqs.map((r) => evalReq(r, section.scoped ? c : { ...c, scoped: entries }, c)),
  }));

  const nodes = flatten(sections.flatMap((s) => s.results)).filter(counts);
  const gates = goal.gates.map((gate): GateResult => {
    const pool =
      gate.needs === 'knowledge-and-experience'
        ? flatten(sections.filter((s) => s.section.kind === 'knowledge' || s.section.kind === 'experience').flatMap((s) => s.results))
        : flatten(gate.needs.map((r) => evalReq(r, c)));
    const open = pool.filter((r) => counts(r) && !r.met);
    const examsPassed = gate.exams?.every((key) => passed(c, key, examCheck(key)?.minScore ?? 0)) ?? false;
    return { gate, met: open.length === 0, passed: examsPassed, open };
  });

  let minutesToGo = 0;
  for (const r of nodes) {
    if (r.req.kind === 'time' && !r.met) minutesToGo = Math.max(minutesToGo, r.need - r.have);
  }

  const done = nodes.filter((r) => r.met).length;
  return {
    goal,
    held: profile.held[goal.id] ?? null,
    credited: goal.credit?.(c) ?? null,
    scope,
    sections,
    gates,
    done,
    total: nodes.length,
    minutesToGo,
    complete: done === nodes.length,
  };
}
