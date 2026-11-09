import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { emptyLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { goalById } from '../../src/rules/goals';
import { momentOf } from '../../src/rules/moment';
import { goalProgress } from '../../src/rules/progress';
import { line, profile } from './fixtures';

const TODAY = '2026-11-08';
const ppl = goalById('ppl');
const dual = (hours: number) => line('2026-10-01', { seDayDual: hours });
const solo = (hours: number) => line('2026-10-02', { seDayPic: hours }, { solo: true });

describe('how far along a goal is', () => {
  it('goes by hours flown, not by requirements ticked', () => {
    // 26.1 of the 45 h: 58%, with only a few of the requirements met.
    expect(goalProgress(ppl, [dual(20.1), solo(6)], profile(), TODAY)).toMatchObject({ need: 45 * 60, left: 18.9 * 60, percent: 58 });
  });

  it('never says 100 until everything is done, and is full for what is held', () => {
    expect(goalProgress(ppl, [dual(33), solo(12)], profile(), TODAY).percent).toBeLessThan(100);
    expect(goalProgress(ppl, [], profile({ held: { ppl: { date: '' } } }), TODAY).percent).toBe(100);
  });

  it('goes by what is ticked for a rating with no minimum hours', () => {
    expect(goalProgress(goalById('multi'), [], profile(), TODAY)).toMatchObject({ need: 0, percent: 0 });
  });
});

describe('the moment after logging', () => {
  it('marks a first solo, once', () => {
    expect(momentOf(ppl, [dual(15)], solo(1), profile(), TODAY)?.firstSolo).toBe(true);
    expect(momentOf(ppl, [dual(15), solo(1)], solo(1), profile(), TODAY)?.firstSolo).toBe(false);
    expect(momentOf(ppl, [dual(15)], dual(1), profile(), TODAY)?.firstSolo).toBe(false);
  });

  it('marks passing half way, once', () => {
    expect(momentOf(ppl, [dual(22)], dual(1), profile(), TODAY)?.halfway).toBe(true);
    expect(momentOf(ppl, [dual(23)], dual(1), profile(), TODAY)?.halfway).toBe(false);
  });
});

describe('the Progress screen', () => {
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

  const seed = (milestones = {}) =>
    saveGuestLogbook({ ...emptyLogbook(), entries: [dual(20.1), solo(6)], profile: { ...emptyLogbook().profile, medical: 'cat3', milestones } });

  it('leads with how far along you are, in one switcher', async () => {
    seed();
    render(<App />);
    expect(await screen.findByRole('img', { name: '58% of the way there' })).toBeTruthy();
    expect(screen.getByText('26.1')).toBeTruthy();
    expect(screen.getByText('at least 18.9 h to go')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Private Pilot Licence — Aeroplane' })).toBeTruthy();
    const picker = screen.getByLabelText('Working on') as HTMLSelectElement;
    expect(picker.options[0]?.textContent).toBe('Private Pilot Licence — Aeroplane');
    expect(picker.options[1]?.textContent).toMatch(/^Night Rating — Aeroplane · \d+%$/);
    expect(screen.queryByRole('heading', { name: 'Every licence and rating' })).toBeNull();
  });

  it('keeps what is done folded away, and shows what is left', async () => {
    seed();
    render(<App />);
    const done = (await screen.findByText(/^Done \(\d+\)$/)).closest('details') as HTMLElement;
    expect(within(done).getByText(/Category 3 medical/)).toBeTruthy();
    const open = screen.getByRole('heading', { name: 'Experience' }).closest('.req-section') as HTMLElement;
    expect(within(open).getByText('45 h private pilot flight training')).toBeTruthy();
    expect(within(open).queryByText('12 h solo cross')).toBeNull();
  });

  it('keeps a row where it is while its date and mark are filled in', async () => {
    seed();
    render(<App />);
    const box = (await screen.findByLabelText(/PPAER written exam/)) as HTMLInputElement;
    fireEvent.click(box);
    const section = screen.getByRole('heading', { name: 'Knowledge' }).closest('.req-section') as HTMLElement;
    expect(within(section).getByLabelText('Mark %')).toBeTruthy();
  });

  it('says so when every requirement is met', async () => {
    const dates = { date: '2026-10-20' };
    const milestones = { 'ground-ppl': dates, 'letter-ppaer': dates, 'exam-ppaer': { ...dates, score: 80 }, 'letter-test-ppl': dates, 'test-ppl': dates, 'xc-ppl-150': dates };
    saveGuestLogbook({
      ...emptyLogbook(),
      entries: [line('2026-10-01', { seDayDual: 33, xcDayDual: 3, hood: 5 }), line('2026-10-02', { seDayPic: 12, xcDayPic: 5 }, { solo: true })],
      profile: { ...emptyLogbook().profile, medical: 'cat3', milestones },
    });
    render(<App />);
    expect(await screen.findByText('Every PPL requirement is met.')).toBeTruthy();
    expect(screen.getByText('All hours flown')).toBeTruthy();
    expect(screen.getByRole('img', { name: '100% of the way there' })).toBeTruthy();
  });
});
