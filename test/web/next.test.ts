import { describe, expect, it } from 'vitest';
import type { Entry } from '../../src/model/entry';
import { SAMPLE_RATES, type Profile } from '../../src/model/profile';
import { GOALS, goalById } from '../../src/rules/goals';
import { nextFlights, usualLength, type NextFlight } from '../../src/rules/next';
import { line, profile } from './fixtures';

const TODAY = '2026-11-08';
const flights = (n: number, hours: Parameters<typeof line>[1], extra: Partial<Entry> = {}, date = '2026-10-01') =>
  Array.from({ length: n }, () => line(date, hours, extra));
const dual = (n: number) => flights(n, { seDayDual: 1.5 });
const solo = (n: number) => flights(n, { seDayPic: 1.5 }, { solo: true });
const dualXc = (n: number) => flights(n, { seDayDual: 1.5, xcDayDual: 1.5 });

/** The suggestion, which a test expects there to be: the best first, then the others. */
function ready(id: Parameters<typeof goalById>[0], entries: Entry[], p: Profile = profile()): NextFlight[] {
  const advice = nextFlights(goalById(id), entries, p, TODAY);
  if (advice?.status !== 'ready') throw new Error(`no suggestion: ${JSON.stringify(advice)}`);
  return [advice.best, ...advice.others];
}
const ids = (list: NextFlight[]) => list.map((f) => f.id);
const licensed = (change: Partial<Profile> = {}) => profile({ held: { ppl: { date: '2026-01-01' } }, ...change });

describe('the next flight, for a PPL student', () => {
  it('leaves the order to the school until the first solo', () => {
    expect(nextFlights(goalById('ppl'), dual(10), profile(), TODAY)).toEqual({ status: 'before-solo' });
  });

  it('picks the flight that counts toward the most, from what the rules say', () => {
    // 21 h dual and 6 h solo: the 17 h dual is met, the cross-country and hood time aren't.
    const [best, ...others] = ready('ppl', [...dual(14), ...solo(4)]);
    expect(best?.id).toBe('dual-xc-hood');
    expect(best?.name).toBe('Dual cross-country, a third under the hood');
    expect(best?.minutes).toBe(90);
    expect(best?.saved).toBe(90);
    expect(best?.counts.map((c) => [c.id, c.before, c.after])).toEqual([
      ['ppl-training', 18 * 60, 16.5 * 60],
      ['ppl-dual-xc', 180, 90],
      ['ppl-dual-inst', 300, 270],
    ]);
    // 1.5 h with an instructor at $310, and 13% tax.
    expect(best?.price).toBeCloseTo(525.45);
    expect(ids(others)).toEqual(['solo-local', 'dual-hood']);
  });

  it('keeps solo cross-country for after the dual cross-country, and says it could be the long one', () => {
    expect(ids(ready('ppl', [...dual(14), ...solo(4)]))).not.toContain('solo-xc');
    const [best] = ready('ppl', [...dual(14), ...dualXc(2), ...solo(4)]);
    expect(best?.id).toBe('solo-xc');
    expect(best?.counts.map((c) => c.id)).toEqual(['ppl-training', 'ppl-solo', 'ppl-solo-xc']);
    expect(best?.couldBe).toEqual(['Solo cross-country of at least 150 NM with full-stop landings at 2 points other than the departure point']);
  });

  it('stops offering what no longer helps', () => {
    // The 12 h solo is done but none of it was cross-country: another local solo changes nothing.
    const list = ready('ppl', [...dual(14), ...dualXc(2), ...flights(4, { seDayDual: 1.5, hood: 1.5 }), ...solo(10)]);
    expect(ids(list)).not.toContain('solo-local');
    expect(list[0]?.id).toBe('solo-xc');
  });

  it('never suggests a flight that another does at least as well for no more money', () => {
    const list = ids(ready('ppl', [...dual(14), ...solo(4)]));
    expect(list).not.toContain('dual-local');
    expect(list).not.toContain('dual-xc');
    expect(list).not.toContain('dual-night');
  });
});

describe('the next flight, past the PPL', () => {
  it('builds the night rating, with solo night after the 5 h dual', () => {
    const before = ready('night', [...dual(30)], licensed());
    expect(before[0]?.id).toBe('dual-night-xc');
    expect(ids(before)).not.toContain('solo-night');

    const after = ready('night', [...dual(30), ...flights(4, { seNightDual: 1.5, xcNightDual: 0.5 })], licensed());
    expect(after[0]?.id).toBe('solo-night');
    expect(after[0]?.counts.find((c) => c.unit === 'landings')).toMatchObject({ id: 'night-solo-ldg', before: 10, after: 1 });
  });

  it('doesn’t count instrument time and cross-country on one CPL flight: one is on top of the other', () => {
    const since = (n: number) => flights(n, { seDayDual: 1.5 }, {}, '2026-02-01');
    expect(ids(ready('cpl', since(4), licensed()))).not.toContain('dual-xc-hood');
    // Nearly through the 35 h dual, the parts of it are what's left. Each flight still takes off no more than it lasts.
    for (const f of ready('cpl', since(20), licensed())) expect(f.saved).toBeLessThanOrEqual(f.minutes);
  });

  it('offers an FTD session only with a simulator rate, and then it does the same for less', () => {
    const entries = dual(30);
    expect(ready('vfrott', entries, licensed())[0]?.id).toBe('dual-hood');
    expect(ready('vfrott', entries, licensed({ rates: { ...SAMPLE_RATES, sim: 135 } }))[0]?.id).toBe('ftd');
  });
});

describe('nothing to suggest', () => {
  it('for a goal held, not priced, or with nothing left', () => {
    expect(nextFlights(goalById('ppl'), [...dual(14), ...solo(4)], licensed(), TODAY)).toBeNull();
    expect(nextFlights(goalById('multi'), dual(30), licensed(), TODAY)).toBeNull();
    // Class 4 counts from the course's start, which isn't set: no flight would help.
    expect(nextFlights(goalById('inst4'), dual(30), profile({ held: { cpl: { date: '2025-01-01' } } }), TODAY)).toBeNull();
  });
});

describe('every suggestion, for every goal', () => {
  it('gets the pilot closer, by no more than the flight lasts, and counts toward something', () => {
    const logs = [[...dual(14), ...solo(4)], [...dual(30), ...dualXc(4), ...solo(20)], [...dual(60), ...solo(60), ...flights(10, { seNightDual: 1.5 })]];
    let seen = 0;
    for (const goal of GOALS) {
      for (const entries of logs) {
        const advice = nextFlights(goal, entries, licensed(), TODAY);
        if (advice?.status !== 'ready') continue;
        for (const f of [advice.best, ...advice.others]) {
          seen += 1;
          expect(f.saved).toBeGreaterThan(0);
          expect(f.saved).toBeLessThanOrEqual(f.minutes);
          expect(f.counts.length).toBeGreaterThan(0);
          expect(f.counts.every((c) => c.after < c.before)).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(5);
  });
});

describe('the usual flight', () => {
  it('is the middle of the last ten, to the half hour, within reason', () => {
    expect(usualLength([])).toBe(90);
    expect(usualLength(flights(3, { seDayDual: 1.2 }))).toBe(60);
    expect(usualLength([...flights(3, { seDayDual: 2.1 }), ...flights(1, { seDayDual: 0.5 })])).toBe(120);
    expect(usualLength(flights(1, { seDayDual: 0.3 }))).toBe(60);
    expect(usualLength(flights(1, { seDayDual: 7 }))).toBe(240);
  });

  it('skips paper totals and FTD sessions', () => {
    expect(usualLength([line('2026-10-01', { seDayDual: 40 }, { forward: true }), line('2026-10-02', { ftd: 2 })])).toBe(90);
  });
});
