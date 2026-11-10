import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { byMonth, matches, shortDate } from '../../src/model/search';
import { emptyLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { line } from './fixtures';

const flight = line('2026-11-08', { seDayDual: 1.3, xcDayDual: 1.3 }, { aircraft: 'C172', registration: 'C-GABC', from: 'CYKF', to: 'CYSN', remarks: 'Crosswind landings' });
const solo = line('2026-10-02', { seNightPic: 1 }, { aircraft: 'PA-28', solo: true });
const ftd = line('2026-10-01', { ftd: 1.5 }, { aircraft: 'Redbird' });

describe('finding a flight', () => {
  it('needs every word typed, in any case or order', () => {
    expect(matches(flight, 'c-gabc', 'all')).toBe(true);
    expect(matches(flight, 'cysn cykf', 'all')).toBe(true);
    expect(matches(flight, 'crosswind', 'all')).toBe(true);
    expect(matches(flight, '2026-11', 'all')).toBe(true);
    expect(matches(flight, 'cysn pa-28', 'all')).toBe(false);
    expect(matches(flight, '   ', 'all')).toBe(true);
  });

  it('narrows to a kind of time', () => {
    expect(matches(flight, '', 'dual')).toBe(true);
    expect(matches(flight, '', 'xc')).toBe(true);
    expect(matches(flight, '', 'solo')).toBe(false);
    expect(matches(solo, '', 'solo')).toBe(true);
    expect(matches(solo, '', 'night')).toBe(true);
    expect(matches(ftd, '', 'ftd')).toBe(true);
    expect(matches(ftd, '', 'dual')).toBe(false);
  });
});

describe('the logbook by month', () => {
  it('groups in the order given, with each month’s flight time', () => {
    const months = byMonth([flight, solo, ftd]);
    expect(months.map((m) => [m.label, m.entries.length, m.minutes])).toEqual([
      ['November 2026', 1, 78],
      ['October 2026', 2, 60],
    ]);
    expect(shortDate('2026-11-08')).toBe('Nov 8');
  });

  it('keeps paper totals out of the month they happen to be dated', () => {
    const paper = line('2026-11-08', { seDayDual: 20 }, { forward: true });
    const months = byMonth([paper, flight, solo]);
    expect(months.map((m) => m.label)).toEqual(['November 2026', 'October 2026', 'Brought forward']);
    expect(months[0]!.minutes).toBe(78);
    expect(months[2]!.minutes).toBe(1200);
  });
});

describe('the Logbook screen', () => {
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

  const open = async (entries: ReturnType<typeof line>[]) => {
    saveGuestLogbook({ ...emptyLogbook(), entries });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
    return screen.getByRole('list', { name: 'Logbook entries' });
  };
  const rows = (list: HTMLElement) => list.querySelectorAll('.log-entry').length;
  const many = () => [flight, solo, ftd, ...Array.from({ length: 5 }, () => line('2026-09-01', { seDayDual: 1 }, { aircraft: 'C172' }))];

  it('shows months and plain words, and a tap opens the flight', async () => {
    const list = await open([flight]);
    expect(within(list).getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    const row = within(list).getByRole('button', { name: 'Edit the 2026-11-08 entry' });
    expect(row.textContent).toContain('Nov 8');
    expect(row.textContent).toContain('CYKF → CYSN');
    fireEvent.click(row);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('says landings in words', async () => {
    const list = await open([{ ...flight, dayLandings: 4 }]);
    expect(list.textContent).toContain('4 landings');
  });

  it('offers search once there is something to search', async () => {
    await open([flight]);
    expect(screen.queryByLabelText('Search your logbook')).toBeNull();
    cleanup();
    const list = await open(many());
    expect(rows(list)).toBe(8);
    fireEvent.change(screen.getByLabelText('Search your logbook'), { target: { value: 'cysn' } });
    expect(rows(list)).toBe(1);
    expect(screen.getByRole('status').textContent).toBe('1 of 8 entries');
    fireEvent.change(screen.getByLabelText('Search your logbook'), { target: { value: 'nowhere' } });
    expect(screen.getByText('Nothing matches that.')).toBeTruthy();
  });

  it('filters by kind of time', async () => {
    const list = await open(many());
    fireEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Solo' }));
    expect(rows(list)).toBe(1);
    expect(list.textContent).toContain('PA-28');
  });
});
