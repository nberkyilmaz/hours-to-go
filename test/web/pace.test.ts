import { describe, expect, it } from 'vitest';
import { evaluateGoal } from '../../src/rules/evaluate';
import { goalById } from '../../src/rules/goals';
import { dayText, finishOn, monthText, paceOf } from '../../src/rules/pace';
import { line, profile, totals } from './fixtures';

const TODAY = '2026-11-05';
const WEEKLY = ['09-17', '09-24', '10-01', '10-08', '10-15', '10-22', '10-29', '11-05'].map((d) => line(`2026-${d}`, { seDayDual: 1.2 }));

describe('the pace', () => {
  it('is the time logged a week over the last 8 weeks', () => {
    // Before the window: not counted.
    const pace = paceOf([line('2026-09-05', { seDayDual: 2 }), ...WEEKLY], TODAY);
    expect(pace).toEqual({ perWeek: 72, since: '2026-09-11', whole: true });
  });

  it('starts at a new student’s first flight, over two weeks at least, and needs two flights', () => {
    const first = line('2026-10-30', { seDayDual: 1 });
    expect(paceOf([first], TODAY)).toBeNull();
    // 2.4 h over the first 7 days, measured as 14.
    expect(paceOf([first, line('2026-11-03', { seDayDual: 1.4 })], TODAY)).toEqual({ perWeek: 72, since: '2026-10-30', whole: false });
  });

  it('never counts paper totals, and starts after the latest', () => {
    const book = [
      totals('2026-10-20', { seDayDual: 40, seDayPic: 20 }, { solo: 'all' }),
      line('2026-10-15', { seDayDual: 1 }),
      line('2026-10-25', { seDayDual: 1.5 }),
      line('2026-11-01', { seDayDual: 1.5 }),
    ];
    const pace = paceOf(book, TODAY);
    // 3 h from October 21 to November 5, 16 days.
    expect(pace?.since).toBe('2026-10-21');
    expect(pace?.perWeek).toBeCloseTo((180 * 7) / 16);
    expect(paceOf([totals('2026-11-04', { seDayDual: 60 }), ...WEEKLY], TODAY)).toBeNull();
  });

  it('counts FTD sessions, but not lines without time or dated after today', () => {
    const book = [line('2026-10-20', { ftd: 1.5 }), line('2026-10-27', { seDayDual: 0 }), line('2026-11-02', { seDayDual: 1.5 }), line('2026-11-20', { seDayDual: 9 })];
    expect(paceOf(book, TODAY)?.perWeek).toBeCloseTo((180 * 7) / 17);
  });

  it('is gone after 8 weeks without flying', () => {
    expect(paceOf([line('2026-08-01', { seDayDual: 1 }), line('2026-09-08', { seDayDual: 1 })], TODAY)).toBeNull();
  });
});

describe('the finish date', () => {
  it('is the day the time left is flown at the pace, as a month', () => {
    const pace = { perWeek: 144, since: '2026-09-11', whole: true };
    // 45 h at 2.4 h a week: 18.75 weeks, 132 days.
    expect(finishOn(45 * 60, pace, TODAY)).toBe('2027-03-17');
    expect(monthText('2027-03-17', TODAY)).toBe('March 2027');
    expect(monthText('2026-12-20', TODAY)).toBe('December');
    expect(dayText('2026-10-21')).toBe('October 21');
  });

  it('isn’t given past five years', () => {
    expect(finishOn(1500 * 60, { perWeek: 60, since: '2026-09-11', whole: true }, TODAY)).toBeNull();
  });

  it('can go on to the PPL’s 65 h average while short of it', () => {
    expect(evaluateGoal(goalById('ppl'), [], profile(), TODAY).toAverage).toEqual({ hours: 65, minutes: 20 * 60 });
    // 70 h flown, the solo still to do: past the average already.
    const past = evaluateGoal(goalById('ppl'), [line('2026-10-01', { seDayDual: 70 })], profile(), TODAY);
    expect(past.plan?.solo).toBe(12 * 60);
    expect(past.toAverage).toBeNull();
    expect(evaluateGoal(goalById('cpl'), [], profile(), TODAY).toAverage).toBeNull();
  });
});
