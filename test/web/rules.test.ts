import { describe, expect, it } from 'vitest';
import type { Entry } from '../../src/model/entry';
import type { Profile } from '../../src/model/profile';
import { evaluateGoal, type GoalResult, type ReqResult } from '../../src/rules/evaluate';
import { GOALS, goalById, type Req } from '../../src/rules/goals';
import { line, profile, totals } from './fixtures';

function find(result: GoalResult, id: string): ReqResult {
  const walk = (rs: readonly ReqResult[]): ReqResult | undefined => {
    for (const r of rs) {
      if (r.req.id === id) return r;
      const hit = walk(r.children);
      if (hit) return hit;
    }
    return undefined;
  };
  const hit = walk(result.sections.flatMap((s) => s.results));
  if (!hit) throw new Error(`no requirement ${id}`);
  return hit;
}

const hours = (r: ReqResult) => r.have / 60;
const TODAY = '2026-10-20';
const run = (id: Parameters<typeof goalById>[0], entries: Entry[], p: Profile = profile(), today = TODAY) => evaluateGoal(goalById(id), entries, p, today);

describe('every goal', () => {
  it('evaluates on an empty log without throwing, with nothing complete', () => {
    for (const g of GOALS) {
      const r = evaluateGoal(g, [], profile());
      expect(r.total).toBeGreaterThan(0);
      expect(r.complete).toBe(false);
    }
  });

  it('has unique requirement ids inside each goal', () => {
    for (const g of GOALS) {
      const ids: string[] = [];
      const walk = (rs: readonly Req[]) => {
        for (const r of rs) {
          ids.push(r.id);
          walk(r.sub ?? []);
        }
      };
      walk(g.sections.flatMap((s) => s.reqs));
      expect(new Set(ids).size, g.id).toBe(ids.length);
    }
  });
});

describe('PPL (421.26)', () => {
  it('starts at 45 h to go', () => {
    const r = run('ppl', []);
    expect(r.minutesToGo).toBe(45 * 60);
    expect(r.done).toBe(0);
  });

  it('caps FTD time at 5 h toward the 45 and at 3 h toward the dual instrument 5', () => {
    const r = run('ppl', [line('2026-01-01', { seDayDual: 20, hood: 1 }), line('2026-01-02', { ftd: 8 })]);
    expect(hours(find(r, 'ppl-training'))).toBe(25);
    expect(hours(find(r, 'ppl-dual-inst'))).toBe(4);
    expect(find(r, 'ppl-dual').met).toBe(true);
  });

  it('counts solo and solo cross-country only from lines marked solo', () => {
    const log = [line('2026-01-01', { seDayPic: 3, xcDayPic: 3 }, { solo: true }), line('2026-01-02', { seDayPic: 2, xcDayPic: 2 })];
    const r = run('ppl', log);
    expect(hours(find(r, 'ppl-solo'))).toBe(3);
    expect(hours(find(r, 'ppl-solo-xc'))).toBe(3);
  });

  it('lets you write the PPAER with a medical, ground school, a recent letter and 5 h; the flight test needs 35 h', () => {
    const log = [line('2026-01-01', { seDayDual: 34.9 })];
    expect(run('ppl', log).gates[0]?.open.map((o) => o.req.id)).toEqual(['medical-cat3-cat1', 'ground-ppl', 'letter-ppaer']);
    const ready = profile({ medical: 'cat3', milestones: { 'ground-ppl': { date: '2026-03-01' }, 'letter-ppaer': { date: '2026-09-15' } } });
    expect(run('ppl', log, ready).gates.map((g) => g.met)).toEqual([true, false]);
  });

  it('shows the same check under the exam itself', () => {
    const exam = find(run('ppl', [line('2026-01-01', { seDayDual: 2 })], profile({ medical: 'cat3' })), 'exam-ppaer').exam!;
    expect(exam.ready).toBe(false);
    expect(exam.checks.map((c) => [c.req.id, c.met])).toEqual([
      ['medical-cat3-cat1', true],
      ['ground-ppl', false],
      ['letter-ppaer', false],
      ['write-ppaer-time', false],
    ]);
  });

  it('stops counting a recommendation letter after 60 days', () => {
    const p = profile({ milestones: { 'letter-ppaer': { date: '2026-08-21' } } });
    expect(find(run('ppl', [], p, '2026-10-20'), 'letter-ppaer')).toMatchObject({ met: true, stale: false });
    expect(find(run('ppl', [], p, '2026-10-21'), 'letter-ppaer')).toMatchObject({ met: false, stale: true });
  });

  it('counts the letter as done once the exam is passed', () => {
    const r = run('ppl', [], profile({ milestones: { 'exam-ppaer': { date: '2026-05-01', score: 82 } } }));
    expect(find(r, 'letter-ppaer').credited).toMatch(/Used for the PPAER/);
    expect(r.gates[0]?.passed).toBe(true);
  });
});

describe('Night rating (421.42)', () => {
  // The owner's paper totals: dual and PIC on one line, every PIC hour flown solo.
  const paper = { seDayDual: 40, seNightDual: 5, seDayPic: 30, seNightPic: 3.5 };

  it('explains why solo night time and landings show zero before the solo question is answered', () => {
    const r = run('night', [totals('2026-09-30', paper, {}, { nightLandings: 34 })]);
    expect(hours(find(r, 'night-solo'))).toBe(0);
    expect(find(r, 'night-solo').hint).toMatch(/3\.5 h of PIC night time in your log isn’t counted as solo/);
    expect(find(r, 'night-solo-ldg').hint).toMatch(/^34 night takeoffs & landings/);
  });

  it('counts them once the totals say all PIC was solo, and how many night landings were', () => {
    const r = run('night', [totals('2026-09-30', paper, { solo: 'all' }, { nightLandings: 34, soloNightLandings: 12 })]);
    expect(hours(find(r, 'night-solo'))).toBe(3.5);
    expect(find(r, 'night-solo').hint).toBeNull();
    expect(find(r, 'night-solo-ldg')).toMatchObject({ have: 12, met: true, hint: null });
  });

  it('counts dual night cross-country and solo night landings', () => {
    const r = run('night', [
      line('2026-01-01', { seNightDual: 3, xcNightDual: 2 }),
      line('2026-01-02', { seNightPic: 2 }, { solo: true, nightLandings: 8 }),
    ]);
    expect(find(r, 'night-dual-xc').met).toBe(true);
    const ldg = find(r, 'night-solo-ldg');
    expect([ldg.have, ldg.need, ldg.met]).toEqual([8, 10, false]);
  });
});

describe('Instrument rating (421.46)', () => {
  // About where the owner is: PPL and night done, ~26 h of PIC cross-country, IFR Group 3 under way.
  const log = [
    line('2025-08-31', { seDayDual: 50, seNightDual: 5, xcDayDual: 1, xcNightDual: 2, hood: 15 }, { forward: true }),
    line('2025-08-31', { seDayPic: 10, seNightPic: 5, xcDayPic: 6 }, { forward: true, solo: true, nightLandings: 10 }),
    line('2025-08-31', { seDayPic: 30, xcDayPic: 20 }, { forward: true }),
  ];
  const me = profile({ medical: 'cat3', held: { ppl: { date: '2025-05-01' }, night: { date: '2025-08-31' } }, focus: 'ifr3' });

  it('counts only PIC cross-country toward the 50 h', () => {
    const xc = find(run('ifr3', log, me), 'ifr-pic-xc');
    expect(hours(xc)).toBe(26);
    expect((xc.need - xc.have) / 60).toBe(24);
  });

  it('reports the largest shortfall as the least flying left', () => {
    const r = run('ifr3', log, me);
    expect(hours(find(r, 'ifr-inst'))).toBe(15);
    expect(find(r, 'ifr-dual-inst').met).toBe(true);
    expect(r.minutesToGo).toBe(25 * 60);
  });

  it('counts hood time under a safety pilot as instrument time, but not as dual', () => {
    const r = run('ifr3', [line('2026-01-01', { seDayPic: 2, hood: 1.5 })]);
    expect(hours(find(r, 'ifr-inst'))).toBe(1.5);
    expect(hours(find(r, 'ifr-dual-inst'))).toBe(0);
  });

  it('unlocks INRAT at 5 h instrument flight or ground time, and the flight test only when all knowledge and experience is met', () => {
    const [exam, test] = run('ifr3', log, me).gates;
    expect(exam?.met).toBe(true);
    expect(test?.met).toBe(false);
    expect(test?.open.map((o) => o.req.id)).toEqual(['exam-inrat', 'ifr-pic-xc', 'ifr-inst', 'xc-ifr-100']);

    const cat3 = profile({ medical: 'cat3' });
    expect(run('ifr3', [line('2026-01-01', { ftd: 4.9 })], cat3).gates[0]?.met).toBe(false);
    expect(run('ifr3', [line('2026-01-01', { ftd: 5 })], cat3).gates[0]?.met).toBe(true);
    expect(run('ifr3', [line('2026-01-01', { ftd: 5 })]).gates[0]?.open.map((o) => o.req.id)).toEqual(['medical-cat3-cat1']);
  });

  it('needs no recommendation letter for INRAT', () => {
    const exam = find(run('ifr3', []), 'exam-inrat').exam!;
    expect(exam.checks.map((c) => c.req.id)).toEqual(['medical-cat3-cat1', 'write-inrat-time']);
  });

  it('marks the INRAT card passed once the exam is passed', () => {
    const r = run('ifr3', [], profile({ milestones: { 'exam-inrat': { date: '2026-06-01', score: 85 } } }));
    expect(r.gates[0]?.passed).toBe(true);
    expect(find(r, 'exam-inrat').exam?.passed).toBe(true);
  });

  it('caps ground time at 20 of the 40 h', () => {
    const r = run('ifr3', [line('2026-01-01', { seDayDual: 5, hood: 5 }), line('2026-01-02', { ftd: 30 })]);
    expect(hours(find(r, 'ifr-inst'))).toBe(25);
  });

  it('needs an INRAT mark of 70 or more when a mark is entered', () => {
    const at = (score?: number) =>
      find(run('ifr3', [], profile({ milestones: { 'exam-inrat': score === undefined ? { date: '2026-01-01' } : { date: '2026-01-01', score } } })), 'exam-inrat');
    expect(at(69).met).toBe(false);
    expect(at(69).scoreLow).toBe(true);
    expect(at(70).met).toBe(true);
    expect(at().met).toBe(true);
  });

  it('shares the INRAT pass between Group 3, Group 1 and the ATPL', () => {
    const p = profile({ milestones: { 'exam-inrat': { date: '2026-01-01', score: 88 } } });
    expect(find(run('ifr1', [], p), 'exam-inrat').met).toBe(true);
    expect(find(run('atpl', [], p), 'exam-inrat').met).toBe(true);
  });

  it('says which licence meets the prerequisite', () => {
    const r = run('ifr3', [], profile({ held: { ppl: { date: '2025-05-01' } } }));
    expect(find(r, 'held-ppl-cpl-atpl').value).toBe('You hold the Private Pilot Licence — Aeroplane, since 2025-05-01.');
  });

  it('asks Group 1 for the multi-engine rating', () => {
    expect(find(run('ifr1', []), 'held-multi').met).toBe(false);
    expect(find(run('ifr1', [], profile({ held: { multi: { date: '' } } })), 'held-multi').met).toBe(true);
  });
});

describe('CPL (421.30)', () => {
  const before = line('2024-06-01', { seDayDual: 8, seNightDual: 2 });
  const after = line('2025-03-01', { seDayDual: 11, seNightDual: 1, hood: 4 });
  const ppl = (date: string) => profile({ held: { ppl: { date } } });

  it('counts commercial training only from the PPL issue date', () => {
    const r = run('cpl', [before, after], ppl('2025-01-01'));
    expect(hours(find(r, 'cpl-dual'))).toBe(12);
    expect(hours(find(r, 'cpl-total'))).toBe(22);
    expect(r.scope?.start).toBe('2025-01-01');
  });

  it('counts nothing as commercial training before a PPL, and says so', () => {
    const r = run('cpl', [before, after]);
    expect(hours(find(r, 'cpl-dual'))).toBe(0);
    expect(r.scope?.message).toMatch(/once you hold your PPL/);
  });

  it('counts everything when the PPL date is missing, and asks for it', () => {
    const r = run('cpl', [before, after], profile({ held: { ppl: { date: '' } } }));
    expect(hours(find(r, 'cpl-dual'))).toBe(22);
    expect(r.scope?.message).toMatch(/PPL issue date/);
  });

  it('lets the pilot move the start of the training window', () => {
    const p = { ...ppl('2025-01-01'), trainingStart: { cpl: '2025-04-01' } };
    expect(hours(find(run('cpl', [before, after], p), 'cpl-dual'))).toBe(0);
  });

  it('credits the night items to a night rating and the instrument item to an instrument rating', () => {
    const p = profile({ held: { ppl: { date: '2025-01-01' }, night: { date: '' }, ifr3: { date: '' } } });
    const r = run('cpl', [], p);
    for (const id of ['cpl-dual-night', 'cpl-dual-night-xc', 'cpl-solo-night', 'cpl-solo-night-ldg', 'cpl-dual-inst']) {
      expect(find(r, id).met, id).toBe(true);
      expect(find(r, id).credited, id).not.toBeNull();
    }
    expect(find(r, 'cpl-dual').met).toBe(false);
  });

  it('counts only the part of paper totals the pilot says came after the PPL', () => {
    const p = ppl('2025-05-01');
    const t = (afterPpl: 'none' | 'all' | 'some') =>
      totals('2026-09-30', { seDayDual: 50, seNightDual: 5, seDayPic: 33, hood: 15 }, { solo: 'all', afterPpl, after: { dual: 10, dualInst: 6, solo: 3 } });
    const some = run('cpl', [t('some')], p);
    expect(hours(find(some, 'cpl-dual'))).toBe(10);
    expect(hours(find(some, 'cpl-dual-inst'))).toBe(6);
    expect(hours(find(some, 'cpl-solo'))).toBe(3);
    expect(hours(find(some, 'cpl-total'))).toBe(88);
    expect(some.scope?.message).toBeNull();
    expect(hours(find(run('cpl', [t('none')], p), 'cpl-dual'))).toBe(0);
    expect(hours(find(run('cpl', [t('all')], p), 'cpl-dual'))).toBe(55);
  });

  it('counts unanswered paper totals in full, and says so', () => {
    const r = run('cpl', [totals('2026-09-30', { seDayDual: 50 })], ppl('2025-05-01'));
    expect(hours(find(r, 'cpl-dual'))).toBe(50);
    expect(r.scope?.message).toMatch(/don’t say how much was flown after your PPL/);
  });

  it('does not count FTD time as flight time', () => {
    expect(hours(find(run('cpl', [line('2026-01-01', { ftd: 10 })]), 'cpl-total'))).toBe(0);
  });
});

describe('VFR OTT (421.44)', () => {
  it('is covered by an instrument rating', () => {
    expect(run('vfrott', [], profile({ held: { ifr3: { date: '' } } })).credited).toMatch(/instrument rating/);
  });
});

describe('ATPL (421.34)', () => {
  it('checks each written exam it lists, INRAT included', () => {
    const r = run('atpl', [line('2026-01-01', { seDayPic: 400 })], profile({ medical: 'cat1' }));
    expect(find(r, 'exam-samra').exam).toMatchObject({ name: 'SAMRA', ready: true });
    expect(find(r, 'exam-saron').exam?.checks.map((c) => c.req.id)).toEqual(['medical-cat1', 'write-atpl-time']);
    expect(find(r, 'exam-inrat').exam?.name).toBe('INRAT');
  });

  it('needs 100 h of PIC cross-country beyond the first 100 h', () => {
    const more = (entries: Entry[]) => hours(find(run('atpl', entries), 'atpl-xc-more'));
    expect(more([line('2026-01-01', { meDayPic: 200, xcDayPic: 200 })])).toBe(100);
    expect(more([line('2026-01-01', { seDayPic: 50, xcDayPic: 50 })])).toBe(0);
  });

  it('counts night as PIC or co-pilot but not dual', () => {
    const r = run('atpl', [
      line('2026-01-01', { seNightPic: 5 }),
      line('2026-01-02', { meNightCopilot: 5 }),
      line('2026-01-03', { seNightDual: 5 }),
    ]);
    expect(hours(find(r, 'atpl-night'))).toBe(10);
  });
});

describe('Class 4 instructor (421.69)', () => {
  it('judges the AIRAF’s share of training on the instructor course, not the whole log', () => {
    const log = [line('2025-01-01', { seDayDual: 50 }), line('2026-03-01', { seDayDual: 5 })];
    const r = run('inst4', log, profile({ trainingStart: { inst4: '2026-02-01' } }));
    const time = find(r, 'exam-airaf').exam!.checks.find((c) => c.req.id === 'write-airaf-time')!;
    expect(hours(time)).toBe(5);
    expect(time.met).toBe(false);
  });

  it('waits for a course start date before counting instructor training', () => {
    const log = [line('2026-03-01', { seDayDual: 10 })];
    expect(hours(find(run('inst4', log), 'i4-dual'))).toBe(0);
    expect(hours(find(run('inst4', log, profile({ trainingStart: { inst4: '2026-02-01' } })), 'i4-dual'))).toBe(10);
  });
});
