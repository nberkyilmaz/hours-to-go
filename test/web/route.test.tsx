import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { emptyLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { evaluateGoal } from '../../src/rules/evaluate';
import { GOALS, goalById } from '../../src/rules/goals';
import { goalProgress } from '../../src/rules/progress';
import { routeOf } from '../../src/rules/route';
import { line, profile } from './fixtures';

const TODAY = '2026-11-08';
const ppl = goalById('ppl');
const plan = (entries = [] as ReturnType<typeof line>[], p = profile(), goal = ppl) => routeOf(evaluateGoal(goal, entries, p, TODAY), goalProgress(goal, entries, p, TODAY));

describe('the route', () => {
  it('sits at the ring’s own figure, whatever is ticked', () => {
    const flown = [line('2026-10-01', { seDayDual: 9 })];
    expect(plan(flown)!.percent).toBe(goalProgress(ppl, flown, profile(), TODAY).percent);
    expect(plan(flown, profile({ medical: 'cat3' }))!.percent).toBe(plan(flown)!.percent);
  });

  it('can be drawn for every goal', () => {
    for (const goal of GOALS) expect(plan([], profile(), goal), goal.id).not.toBeNull();
  });

  it('marks the flight test where its hours come', () => {
    expect(plan()!.fixes).toEqual([{ at: 35 / 45, passed: false }]);
  });

  it('fills in the flight test once it’s ticked', () => {
    expect(plan([], profile({ milestones: { 'test-ppl': { date: '2026-10-01' } } }))!.fixes[0]!.passed).toBe(true);
  });

  it('goes on to the next step once the exam is passed', () => {
    expect(plan()!.next!.gate.label).toBe('Write the PPAER');
    const written = plan([], profile({ milestones: { 'exam-ppaer': { date: '2026-10-01', score: 84 } } }));
    expect(written!.next!.gate.label).toBe('Take the flight test');
  });

  it('has no next step on a goal without any', () => {
    expect(plan([], profile({ held: { ppl: { date: '2025-01-01' } } }), goalById('night'))!.next).toBeNull();
  });

  it('isn’t drawn for a goal already held', () => {
    expect(plan([], profile({ held: { ppl: { date: '2026-01-01' } } }))).toBeNull();
  });
});

describe('on Progress', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in to continue.' }) })));
    rememberWelcomed();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('says what’s next', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: profile({ medical: 'cat3' }), entries: [line('2026-10-01', { seDayDual: 9 })] });
    render(<App />);
    const route = (await screen.findByRole('img', { name: /Your route to the PPL/ })).closest('.route')!;
    expect(route.textContent).toContain('Next: Write the PPAER');
    expect(route.textContent).toContain('Flight test');
    expect(route.textContent).toContain('45.0 h');
  });

  it('reads out how far along for someone who can’t see it', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: profile({ medical: 'cat3' }), entries: [line('2026-10-01', { seDayDual: 9 })] });
    render(<App />);
    expect((await screen.findByRole('img', { name: /Your route to the PPL/ })).getAttribute('aria-label')).toBe('Your route to the PPL: 20% of the way.');
  });

  it('is gone once the goal is held', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: profile({ held: { ppl: { date: '2026-01-01' } } }) });
    render(<App />);
    await screen.findByLabelText('Working on');
    expect(screen.queryByRole('img', { name: /Your route/ })).toBeNull();
  });
});
