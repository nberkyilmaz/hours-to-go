import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { emptyLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { evaluateGoal } from '../../src/rules/evaluate';
import { GOALS, goalById } from '../../src/rules/goals';
import { routeOf } from '../../src/rules/route';
import { line, profile } from './fixtures';

const TODAY = '2026-11-08';
const ppl = goalById('ppl');
const legs = (entries = [] as ReturnType<typeof line>[], p = profile()) => routeOf(evaluateGoal(ppl, entries, p, TODAY));

describe('the route', () => {
  it('has a leg for each part of the standard', () => {
    expect(legs()!.map((l) => l.title)).toEqual(['Prerequisites', 'Knowledge', 'Experience', 'Skill']);
  });

  it('can be drawn for every goal', () => {
    for (const goal of GOALS) {
      const route = routeOf(evaluateGoal(goal, [], profile(), TODAY));
      expect(route, goal.id).not.toBeNull();
      expect(route!.length, goal.id).toBeGreaterThan(0);
    }
  });

  it('counts what’s been done on a leg', () => {
    const [prerequisites] = legs([], profile({ medical: 'cat3' }))!;
    expect(prerequisites).toMatchObject({ done: 1, total: 1, part: 1, complete: true });
  });

  it('moves along an experience leg by the hours flown, not by what’s finished', () => {
    const experience = legs([line('2026-10-01', { seDayDual: 9 })])!.find((l) => l.title === 'Experience')!;
    expect(experience.done).toBe(0);
    expect(experience.part).toBeGreaterThan(0);
    expect(experience.part).toBeLessThan(1);
  });

  it('goes by what’s ticked on a leg with no hours', () => {
    const knowledge = legs([], profile({ milestones: { 'ground-ppl': { date: '2026-01-01' } } }))!.find((l) => l.title === 'Knowledge')!;
    expect(knowledge.part).toBe(knowledge.done / knowledge.total);
  });

  it('never runs past the end of a leg', () => {
    for (const leg of legs([line('2026-10-01', { seDayDual: 500 })])!) expect(leg.part).toBeLessThanOrEqual(1);
  });

  it('isn’t drawn for a goal already held', () => {
    expect(legs([], profile({ held: { ppl: { date: '2026-01-01' } } }))).toBeNull();
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

  it('names the leg being flown and the one after it', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: profile({ medical: 'cat3' }), entries: [line('2026-10-01', { seDayDual: 9 })] });
    render(<App />);
    const now = (await screen.findByRole('img', { name: /Your route to the PPL/ })).closest('.route')!;
    expect(now.textContent).toContain('Knowledge');
    expect(now.textContent).toContain('then Experience');
  });

  it('reads out every leg for someone who can’t see it', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: profile({ medical: 'cat3' }) });
    render(<App />);
    const route = await screen.findByRole('img', { name: /Your route to the PPL/ });
    expect(route.getAttribute('aria-label')).toContain('Prerequisites: done');
    expect(route.getAttribute('aria-label')).toMatch(/Knowledge: 0 of \d/);
  });

  it('is gone once the goal is held', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: profile({ held: { ppl: { date: '2026-01-01' } } }) });
    render(<App />);
    await screen.findByLabelText('Working on');
    expect(screen.queryByRole('img', { name: /Your route/ })).toBeNull();
  });
});
