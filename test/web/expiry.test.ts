import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dateText } from '../../src/model/entry';
import type { GoalId, MilestoneRecord, Profile } from '../../src/model/profile';
import { blankProfile } from '../../src/model/profile';
import { emptyLogbook, mergeLogbooks, parseProfile } from '../../src/model/store';
import { evaluateGoal, flatten, type GoalResult } from '../../src/rules/evaluate';
import { goalById } from '../../src/rules/goals';
import { profile } from './fixtures';

const TODAY = '2026-11-08';
const run = (id: GoalId, p: Profile): GoalResult => evaluateGoal(goalById(id), [], p, TODAY);
const find = (r: GoalResult, id: string) => {
  const hit = flatten(r.sections.flatMap((s) => s.results)).find((x) => x.req.id === id);
  if (!hit) throw new Error(`no requirement ${id}`);
  return hit;
};
const done = (milestones: Record<string, MilestoneRecord>, change: Partial<Profile> = {}) => profile({ milestones, ...change });

describe('dates', () => {
  it('adds months, keeping to the end of a shorter month, and days', () => {
    expect(addMonths('2026-11-08', 24)).toBe('2028-11-08');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-02-29', 24)).toBe('2026-02-28');
    expect(addDays('2026-10-09', 30)).toBe('2026-11-08');
    expect(dateText('2028-03-01')).toBe('March 1, 2028');
  });
});

describe('a written exam', () => {
  it('counts through the last day of its 24 months, and not after', () => {
    const on = find(run('ppl', done({ 'exam-ppaer': { date: '2024-11-08', score: 80 } })), 'exam-ppaer');
    expect(on).toMatchObject({ met: true, stale: false, until: '2026-11-08' });
    const past = find(run('ppl', done({ 'exam-ppaer': { date: '2024-11-07', score: 80 } })), 'exam-ppaer');
    expect(past).toMatchObject({ met: false, stale: true, until: '2026-11-07' });
  });

  it('can’t be checked without its date, so it still counts', () => {
    expect(find(run('ppl', done({ 'exam-ppaer': { date: '' } })), 'exam-ppaer')).toMatchObject({ met: true, until: null });
  });

  it('stops mattering once what it was for is held', () => {
    const old = { 'exam-ppaer': { date: '2019-01-01', score: 80 } };
    expect(find(run('ppl', done(old, { held: { ppl: { date: '2020-01-01' } } })), 'exam-ppaer')).toMatchObject({ met: true, stale: false, until: null });
  });

  it('keeps an instrument rating’s INRAT good for the ATPL, but not an INRAT with no rating', () => {
    const old = { 'exam-inrat': { date: '2019-01-01', score: 80 } };
    expect(find(run('atpl', done(old)), 'exam-inrat').stale).toBe(true);
    expect(find(run('atpl', done(old, { held: { ifr3: { date: '2020-01-01' } } })), 'exam-inrat').met).toBe(true);
  });

  it('that has run out reopens the exam: its gate, and the letter it used', () => {
    const r = run('ppl', done({ 'exam-ppaer': { date: '2023-01-01', score: 80 }, 'letter-ppaer': { date: '2022-12-01' } }));
    expect(r.gates[0]?.passed).toBe(false);
    expect(find(r, 'exam-ppaer').exam?.passed).toBe(false);
    expect(find(r, 'letter-ppaer')).toMatchObject({ credited: null, stale: true, met: false });

    const fresh = run('ppl', done({ 'exam-ppaer': { date: '2026-01-01', score: 80 }, 'letter-ppaer': { date: '2025-12-01' } }));
    expect(fresh.gates[0]?.passed).toBe(true);
    expect(find(fresh, 'letter-ppaer').credited).toMatch(/Used for the PPAER/);
  });
});

describe('a flight test', () => {
  it('counts for 12 months where the standard says so', () => {
    expect(find(run('ppl', done({ 'test-ppl': { date: '2025-11-08' } })), 'test-ppl')).toMatchObject({ met: true, until: '2026-11-08' });
    expect(find(run('ppl', done({ 'test-ppl': { date: '2025-11-07' } })), 'test-ppl')).toMatchObject({ met: false, stale: true });
    for (const [goal, key] of [['night', 'test-night'], ['cpl', 'test-cpl'], ['atpl', 'test-atpl']] as const) {
      expect(find(run(goal, done({ [key]: { date: '2024-01-01' } })), key).stale).toBe(true);
    }
  });

  it('has no limit where the standard sets none', () => {
    expect(find(run('vfrott', done({ 'test-vfrott': { date: '2010-01-01' } })), 'test-vfrott')).toMatchObject({ met: true, until: null });
  });

  it('needs a letter dated within the 30 days before it, until the test is passed', () => {
    const open = run('ppl', profile()).gates[1]?.open.map((o) => o.req.id);
    expect(open).toContain('letter-test-ppl');
    expect(find(run('ppl', done({ 'letter-test-ppl': { date: '2026-10-09' } })), 'letter-test-ppl')).toMatchObject({ met: true, until: '2026-11-08' });
    expect(find(run('ppl', done({ 'letter-test-ppl': { date: '2026-10-08' } })), 'letter-test-ppl')).toMatchObject({ met: false, stale: true });
    const used = find(run('ppl', done({ 'letter-test-ppl': { date: '2026-01-01' }, 'test-ppl': { date: '2026-02-01' } })), 'letter-test-ppl');
    expect(used.credited).toMatch(/Used for the flight test/);
    expect(find(run('cpl', profile()), 'letter-test-cpl').met).toBe(false);
  });
});

describe('the medical', () => {
  const id = 'medical-cat3-cat1';
  it('counts through its valid-to date, and not after', () => {
    expect(find(run('ppl', profile({ medical: 'cat3', medicalUntil: TODAY })), id)).toMatchObject({ met: true, stale: false, until: TODAY });
    expect(find(run('ppl', profile({ medical: 'cat3', medicalUntil: '2026-11-07' })), id)).toMatchObject({ met: false, stale: true });
  });

  it('counts as before when no date is entered, and a wrong category never counts', () => {
    expect(find(run('ppl', profile({ medical: 'cat3' })), id)).toMatchObject({ met: true, until: null });
    expect(find(run('ppl', profile({ medical: 'cat4', medicalUntil: '2030-01-01' })), id)).toMatchObject({ met: false, stale: false, until: null });
  });

  it('holds up writing an exam when it has run out', () => {
    const exam = find(run('ppl', profile({ medical: 'cat3', medicalUntil: '2026-01-01' })), 'exam-ppaer').exam;
    expect(exam?.checks.find((c) => c.req.id === id)).toMatchObject({ met: false, stale: true });
  });
});

describe('the date in the profile', () => {
  it('is read only when it is a date, for a medical there is', () => {
    expect(parseProfile({ medical: 'cat1', medicalUntil: '2027-05-01' }).medicalUntil).toBe('2027-05-01');
    expect(parseProfile({ medical: 'cat1', medicalUntil: 'soon' }).medicalUntil).toBe('');
    expect(parseProfile({ medical: 'none', medicalUntil: '2027-05-01' }).medicalUntil).toBe('');
    expect(blankProfile().medicalUntil).toBe('');
  });

  it('goes with the medical it belongs to when logbooks merge', () => {
    const book = (p: Partial<Profile>) => ({ ...emptyLogbook(), profile: profile(p) });
    expect(mergeLogbooks(book({ medical: 'cat1', medicalUntil: '2027-01-01' }), book({ medical: 'cat3', medicalUntil: '2030-01-01' })).profile).toMatchObject({ medical: 'cat1', medicalUntil: '2027-01-01' });
    expect(mergeLogbooks(book({}), book({ medical: 'cat3', medicalUntil: '2030-01-01' })).profile).toMatchObject({ medical: 'cat3', medicalUntil: '2030-01-01' });
  });
});
