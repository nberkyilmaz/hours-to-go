import { describe, expect, it } from 'vitest';
import type { Entry } from '../../src/model/entry';
import { SAMPLE_RATES, type GoalId, type Profile } from '../../src/model/profile';
import { emptyLogbook, mergeLogbooks, parseProfile } from '../../src/model/store';
import { about, atLeast, money, priceOf, rateText } from '../../src/rules/cost';
import { evaluateGoal } from '../../src/rules/evaluate';
import { GOALS, goalById } from '../../src/rules/goals';
import { line, profile } from './fixtures';

const TODAY = '2026-11-04';
const plan = (id: GoalId, entries: Entry[] = [], p: Profile = profile()) => evaluateGoal(goalById(id), entries, p, TODAY).plan;
const h = (hours: number) => hours * 60;
const SIM = { ...SAMPLE_RATES, sim: 135 };
const withSim = (change: Partial<Profile> = {}) => profile({ rates: SIM, ...change });

describe('the PPL plan', () => {
  it('starts at 33 h dual and 12 h solo, the way schools price the 45 h', () => {
    expect(plan('ppl')).toEqual({ dual: h(33), sim: 0, solo: h(12) });
  });

  it('puts what is left of the 45 h with an instructor once the dual items are met', () => {
    const log = [line('2026-01-01', { seDayDual: 20, xcDayDual: 3, hood: 5 }), line('2026-02-01', { seDayPic: 8, xcDayPic: 3 }, { solo: true })];
    expect(plan('ppl', log)).toEqual({ dual: h(13), sim: 0, solo: h(4) });
  });

  it('prices dual and solo items still open after the 45 h, which can be more than the largest shortfall', () => {
    const log = [line('2026-01-01', { seDayDual: 30 }), line('2026-02-01', { seDayPic: 15 }, { solo: true })];
    const r = evaluateGoal(goalById('ppl'), log, profile(), TODAY);
    // Hood work can be flown on the dual cross-country, so 5 h covers both; solo is another flight.
    expect(r.plan).toEqual({ dual: h(5), sim: 0, solo: h(5) });
    expect(r.minutesToGo).toBe(h(5));
  });

  it('keeps the PPL in the aeroplane even with a simulator rate', () => {
    expect(plan('ppl', [], withSim())?.sim).toBe(0);
  });
});

describe('the other plans', () => {
  it('prices the night rating’s instrument time on top of its 10 night hours, up to 5 h of it in a simulator', () => {
    expect(plan('night')).toEqual({ dual: h(15), sim: 0, solo: h(5) });
    // 2 h of FTD already used leaves 3 h of the ground allowance, and 8 h of instrument time.
    expect(plan('night', [line('2026-01-01', { ftd: 2 })], withSim())).toEqual({ dual: h(10), sim: h(3), solo: h(5) });
  });

  // PPL training before the licence: 50 h in all, 15 h of it solo with 5 h cross-country.
  const pplEra = [line('2025-01-01', { seDayDual: 35, xcDayDual: 3, hood: 5 }), line('2025-02-01', { seDayPic: 15, xcDayPic: 5 }, { solo: true })];
  const cplPilot = (change: Partial<Profile> = {}) => profile({ held: { ppl: { date: '2025-05-01' } }, ...change });

  it('prices the CPL as 35 h dual, 30 h solo and time building to 200 h, and a simulator saves nothing while the 35 h binds', () => {
    const expected = { dual: h(35), sim: 0, solo: h(115) };
    expect(plan('cpl', pplEra, cplPilot())).toEqual(expected);
    expect(plan('cpl', pplEra, cplPilot({ rates: SIM }))).toEqual(expected);
  });

  it('puts CPL instrument time in the simulator once the 35 h dual are flown, and builds the time it doesn’t log', () => {
    const log = [...pplEra, line('2025-06-01', { seDayDual: 30, xcDayDual: 5, hood: 5 }), line('2025-07-01', { seNightDual: 5, xcNightDual: 2 })];
    expect(plan('cpl', log, cplPilot())).toEqual({ dual: h(15), sim: 0, solo: h(100) });
    expect(plan('cpl', log, cplPilot({ rates: SIM }))).toEqual({ dual: h(5), sim: h(10), solo: h(110) });
  });

  it('prices IFR cross-country without an instructor and all instrument time with one, up to 20 h of it in a simulator', () => {
    expect(plan('ifr3')).toEqual({ dual: h(40), sim: 0, solo: h(50) });
    expect(plan('ifr3', [], withSim())).toEqual({ dual: h(20), sim: h(20), solo: h(50) });
  });

  it('prices the Class 4 course’s 30 h, up to 5 h of it in a simulator', () => {
    const p = withSim({ trainingStart: { inst4: '2026-01-01' } });
    expect(plan('inst4', [line('2026-02-01', { ftd: 2 })], p)).toEqual({ dual: h(25), sim: h(3), solo: 0 });
  });

  it('leaves the multi-engine rating and the ATPL unpriced', () => {
    expect(plan('multi')).toBeNull();
    expect(plan('atpl')).toBeNull();
    expect(plan('vfrott')).toEqual({ dual: h(15), sim: 0, solo: 0 });
  });

  it('never prices less flying than the largest shortfall', () => {
    const logs = [[], pplEra, [line('2026-03-01', { seNightPic: 4, actualImc: 2, xcNightPic: 3 }, { solo: true })]];
    // The Class 4 plan prices the instructor course alone; its 200 h before the course come with a CPL.
    for (const g of GOALS.filter((x) => x.id !== 'inst4')) {
      for (const log of logs) {
        for (const p of [profile(), withSim()]) {
          const r = evaluateGoal(g, log, p, TODAY);
          if (r.plan) expect(r.plan.dual + r.plan.sim + r.plan.solo, g.id).toBeGreaterThanOrEqual(r.minutesToGo);
        }
      }
    }
  });
});

describe('the price', () => {
  it('adds the aeroplane and the instructor for dual, and tax on top', () => {
    const cost = priceOf({ dual: h(33), sim: 0, solo: h(12) }, SAMPLE_RATES);
    expect(cost.lines).toEqual([
      { kind: 'dual', hours: 33, rate: 310, amount: 10230 },
      { kind: 'solo', hours: 12, rate: 220, amount: 2640 },
    ]);
    expect(cost.subtotal).toBe(12870);
    expect(cost.tax).toBe(1673.1);
    expect(cost.total).toBe(14543.1);
    expect(cost.perHour).toEqual({ dual: 350.3, solo: 248.6 });
    expect(money(about(cost.total))).toBe('$14,500');
  });

  it('bills in tenths of an hour, rounded up, and prices a simulator hour with the instructor', () => {
    const cost = priceOf({ dual: 50, sim: h(2), solo: 0 }, { aircraft: 200, instructor: 80, sim: 120, tax: 0 });
    expect(cost.lines).toEqual([
      { kind: 'dual', hours: 0.9, rate: 280, amount: 252 },
      { kind: 'sim', hours: 2, rate: 200, amount: 400 },
    ]);
    expect(cost.total).toBe(652);
  });

  it('rounds to $100, or to $10 under $1,000, the headline down, and prints rates as schools do', () => {
    expect([about(14550), about(14549), about(949), about(0)]).toEqual([14600, 14500, 950, 0]);
    // "At least" never tops the panel's own total.
    expect([atLeast(14599.99), atLeast(14500), atLeast(1000), atLeast(999.99), atLeast(0)]).toEqual([14500, 14500, 1000, 990, 0]);
    expect([rateText(212.5), rateText(220), money(123456.7)]).toEqual(['$212.50', '$220', '$123,457']);
  });
});

describe('the rates in the profile', () => {
  it('stay empty until entered, and are kept within reason', () => {
    expect(parseProfile({}).rates).toBeNull();
    expect(parseProfile({ rates: { aircraft: 212.756, instructor: '90', sim: -5, tax: 99 } }).rates).toEqual({
      aircraft: 212.76,
      instructor: 0,
      sim: null,
      tax: 30,
    });
    expect(parseProfile({ rates: { aircraft: 1e9, instructor: 92, sim: 135, tax: 14.975 } }).rates).toEqual({
      aircraft: 10_000,
      instructor: 92,
      sim: 135,
      tax: 14.975,
    });
  });

  it('come along when a device’s log moves into a profile that has none', () => {
    const mine = { ...SAMPLE_RATES, aircraft: 235 };
    const guest = { ...emptyLogbook(), profile: profile({ rates: mine }) };
    expect(mergeLogbooks(emptyLogbook(), guest).profile.rates).toEqual(mine);
    const account = { ...emptyLogbook(), profile: profile({ rates: SAMPLE_RATES }) };
    expect(mergeLogbooks(account, guest).profile.rates).toEqual(SAMPLE_RATES);
  });
});
