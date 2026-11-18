import { describe, expect, it } from 'vitest';
import { blankProfile, type Profile } from '../../src/model/profile';
import { mergeLogbooks, parseProfile } from '../../src/model/store';
import { evaluateGoal, flatten } from '../../src/rules/evaluate';
import { goalById } from '../../src/rules/goals';
import { medicalEnd, medicalPeriods, periodEnd } from '../../src/rules/medical';
import { comingUp } from '../../src/rules/reminders';
import { line, profile } from './fixtures';

const medical = (change: Partial<Profile>) => profile({ medical: 'cat1', medicalExam: '2026-01-10', ...change });
const met = (goal: string, p: Profile, today: string) => {
  const r = flatten(evaluateGoal(goalById(goal as Parameters<typeof goalById>[0]), [], p, today).sections.flatMap((s) => s.results)).find((x) => x.req.kind === 'medical')!;
  return { met: r.met, until: r.until };
};

describe('how long a medical lasts (CAR 404.04)', () => {
  it('counts from the first of the month after the exam, and ends the day before', () => {
    expect(periodEnd('2026-01-10', 'commercial', 'under40')).toBe('2027-01-31');
    expect(periodEnd('2026-01-31', 'commercial', 'under40')).toBe('2027-01-31');
    expect(periodEnd('2026-12-01', 'commercial', 'under40')).toBe('2027-12-31');
  });

  it('gives a Category 1 12 months for commercial flying, and the private period after it', () => {
    expect(medicalPeriods(medical({}))).toMatchObject([
      { privileges: 'commercial', until: '2027-01-31', key: 'medical-commercial' },
      { privileges: 'private', until: '2031-01-31', key: 'medical' },
    ]);
  });

  it('is shorter with age: 24 months for private flying from 40, 6 months for commercial from 60', () => {
    expect(medicalEnd(medical({ medicalAge: 'over40' }), 'private')).toBe('2028-01-31');
    expect(medicalEnd(medical({ medicalAge: 'over40' }), 'commercial')).toBe('2027-01-31');
    expect(medicalEnd(medical({ medicalAge: 'over60' }), 'commercial')).toBe('2026-07-31');
  });

  it('gives a Category 3 private privileges only, and a Category 4 a student permit', () => {
    expect(medicalPeriods(medical({ medical: 'cat3' }))).toMatchObject([{ privileges: 'private', until: '2031-01-31', what: 'Your medical certificate' }]);
    expect(medicalEnd(medical({ medical: 'cat3' }), 'commercial')).toBeNull();
    expect(medicalPeriods(medical({ medical: 'cat4', medicalAge: 'over40' }))).toMatchObject([{ privileges: 'permit', until: '2031-01-31' }]);
  });

  it('keeps a "valid to" date entered before, until there is an exam date', () => {
    const old = profile({ medical: 'cat1', medicalUntil: '2027-05-01' });
    expect(medicalEnd(old, 'commercial')).toBe('2027-05-01');
    expect(medicalPeriods(old)).toEqual([{ privileges: 'commercial', until: '2027-05-01', key: 'medical', what: 'Your medical certificate' }]);
    expect(medicalEnd({ ...old, medicalExam: '2026-01-10' }, 'commercial')).toBe('2027-01-31');
  });

  it('can’t be checked without a date, so it counts', () => {
    expect(medicalEnd(profile({ medical: 'cat1' }), 'commercial')).toBeNull();
    expect(medicalPeriods(profile({ medical: 'cat1' }))).toEqual([]);
  });
});

describe('the medical in the requirements', () => {
  it('holds a Category 1 to 12 months for the CPL, and to the private period for the PPL', () => {
    const p = medical({});
    expect(met('cpl', p, '2027-01-31')).toEqual({ met: true, until: '2027-01-31' });
    expect(met('cpl', p, '2027-02-01')).toEqual({ met: false, until: '2027-01-31' });
    expect(met('ppl', p, '2027-02-01')).toEqual({ met: true, until: '2031-01-31' });
  });
});

describe('reminders for the medical', () => {
  it('reminds of a Category 1’s commercial end and, years later, its private one', () => {
    const p = medical({});
    expect(comingUp([], p, '2027-01-01')).toMatchObject([{ key: 'medical-commercial', what: 'Your medical for commercial flying', until: '2027-01-31', daysLeft: 30 }]);
    expect(comingUp([], p, '2031-01-24')).toMatchObject([{ key: 'medical', what: 'Your medical for private flying', daysLeft: 7 }]);
  });

  it('still reminds of an old "valid to" date', () => {
    expect(comingUp([line('2026-01-01', { seDayDual: 1 })], profile({ medical: 'cat3', medicalUntil: '2026-12-08' }), '2026-11-08')).toMatchObject([{ key: 'medical', daysLeft: 30 }]);
  });
});

describe('the medical in a saved profile', () => {
  it('reads the exam date and the age, and nothing that isn’t one', () => {
    expect(parseProfile({ medical: 'cat1', medicalExam: '2026-01-10', medicalAge: 'over40' })).toMatchObject({ medicalExam: '2026-01-10', medicalAge: 'over40' });
    expect(parseProfile({ medical: 'cat1', medicalExam: 'last spring', medicalAge: 'old' })).toMatchObject({ medicalExam: '', medicalAge: 'under40' });
    expect(parseProfile({ medical: 'none', medicalExam: '2026-01-10' }).medicalExam).toBe('');
    expect(blankProfile()).toMatchObject({ medicalExam: '', medicalAge: 'under40', landings: [] });
  });

  it('keeps one certificate’s fields together when logbooks merge', () => {
    const book = (p: Partial<Profile>) => ({ version: 2 as const, entries: [], profile: profile(p) });
    const merged = mergeLogbooks(book({ medical: 'cat1', medicalExam: '2026-01-10', medicalAge: 'over40' }), book({ medical: 'cat3', medicalExam: '2020-01-01' }));
    expect(merged.profile).toMatchObject({ medical: 'cat1', medicalExam: '2026-01-10', medicalAge: 'over40' });
    expect(mergeLogbooks(book({}), book({ medical: 'cat3', medicalExam: '2020-01-01' })).profile).toMatchObject({ medical: 'cat3', medicalExam: '2020-01-01' });
  });
});
