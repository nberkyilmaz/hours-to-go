import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import type { Profile } from '../../src/model/profile';
import { emptyLogbook, loadGuestLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { currencyOf, type CurrencyItem } from '../../src/rules/currency';
import { line, profile, totals } from './fixtures';

const TODAY = '2026-11-08';
const licensed = (change: Partial<Profile> = {}) => profile({ held: { ppl: { date: '2026-01-15' } }, ...change });
const flight = (date: string, day: number, night = 0, extra = {}) => line(date, { seDayPic: 1 }, { dayLandings: day, nightLandings: night, ...extra });
const items = (entries: Parameters<typeof currencyOf>[0], p: Profile = licensed()) => currencyOf(entries, p, TODAY)!;
const item = (list: CurrencyItem[], id: string) => list.find((i) => i.id === id)!;

describe('currency', () => {
  it('is only for a pilot who holds a licence', () => {
    expect(currencyOf([], profile(), TODAY)).toBeNull();
    expect(currencyOf([], profile({ held: { night: { date: '' } } }), TODAY)).toBeNull();
    expect(currencyOf([], licensed(), TODAY)).not.toBeNull();
  });

  describe('passengers', () => {
    it('counts takeoffs and landings by day or night in the last 6 months', () => {
      const day = item(items([flight('2026-10-01', 3), flight('2026-08-01', 1, 1)]), 'passengers-day');
      expect(day).toMatchObject({ current: true, note: null, until: '2027-02-01' });
    });

    it('says how far short it is, ignoring what is too old', () => {
      expect(item(items([flight('2026-10-01', 3), flight('2026-05-07', 9)]), 'passengers-day')).toMatchObject({ current: false, note: '3 of 5 in the last 6 months', until: null });
    });

    it('counts up to the day 6 months back, and not before', () => {
      expect(item(items([flight('2026-05-08', 5)]), 'passengers-day').current).toBe(true);
      expect(item(items([flight('2026-05-07', 5)]), 'passengers-day').current).toBe(false);
    });

    it('agrees with its own end date at the end of a month', () => {
      const lines = [flight('2026-02-28', 5)];
      const on = (day: string) => item(currencyOf(lines, licensed(), day)!, 'passengers-day');
      expect(on('2026-08-28')).toMatchObject({ current: true, until: '2026-08-28' });
      expect(on('2026-08-31')).toMatchObject({ current: false, until: null, note: '0 of 5 in the last 6 months' });
    });

    it('needs night landings for passengers at night', () => {
      const list = items([flight('2026-10-01', 9, 4)]);
      expect(item(list, 'passengers-day').current).toBe(true);
      expect(item(list, 'passengers-night')).toMatchObject({ current: false, note: '4 of 5 in the last 6 months' });
    });

    it('keeps single-engine and multi-engine apart, since it must be the same class', () => {
      const multi = line('2026-10-01', { meDayPic: 2 }, { dayLandings: 9 });
      const list = items([multi, flight('2026-10-02', 1)]);
      expect(item(list, 'passengers-day-multi').current).toBe(true);
      expect(item(list, 'passengers-day')).toMatchObject({ label: expect.stringContaining('single-engine'), current: false });
    });

    it('leaves out a simulator, since the log can’t say what level it was', () => {
      expect(item(items([line('2026-10-01', { ftd: 2 }, { dayLandings: 9 })]), 'passengers-day')).toMatchObject({ current: false, note: '0 of 5 in the last 6 months' });
    });

    it('can’t see landings in paper totals', () => {
      expect(item(items([totals('2026-10-01', { seDayPic: 100 }, { solo: 'all' }, { dayLandings: 50 })]), 'passengers-day').current).toBe(false);
    });
  });

  it('holds for 5 years from the last flight as PIC or co-pilot, paper totals included', () => {
    expect(item(items([flight('2023-01-01', 1)]), 'five-years')).toMatchObject({ current: true, until: '2028-01-01' });
    expect(item(items([flight('2021-01-01', 1)]), 'five-years').current).toBe(false);
    expect(item(items([totals('2024-06-01', { seDayPic: 10 }, { solo: 'all' })]), 'five-years').until).toBe('2029-06-01');
    expect(item(items([]), 'five-years')).toMatchObject({ current: false, note: 'No flight in your log yet' });
  });

  describe('recurrent training', () => {
    it('holds for 24 months, and a licence issued counts', () => {
      expect(item(items([]), 'recurrent')).toMatchObject({ current: true, until: '2028-01-15' });
    });

    it('takes the date the pilot enters, the latest of them', () => {
      const p = licensed({ held: { ppl: { date: '2020-01-01' } }, milestones: { 'recurrent-training': { date: '2026-03-01' } } });
      expect(item(items([], p), 'recurrent')).toMatchObject({ current: true, until: '2028-03-01' });
    });

    it('asks when there is no date to go on', () => {
      expect(item(items([], profile({ held: { ppl: { date: '' } } })), 'recurrent')).toMatchObject({ current: false, note: 'Add the date of your last recurrent training' });
    });
  });

  describe('an instrument rating', () => {
    const ifr = (date: string) => licensed({ held: { ppl: { date: '2020-01-01' }, ifr3: { date } } });

    it('adds the 24-month check and the approaches', () => {
      expect(items([]).some((i) => i.id === 'ifr-check')).toBe(false);
      expect(item(items([], ifr('2025-06-01')), 'ifr-check')).toMatchObject({ current: true, until: '2027-06-01' });
      expect(item(items([], ifr('2024-06-01')), 'ifr-check').current).toBe(false);
    });

    it('counts the seventh month from the month of the check', () => {
      expect(item(items([], ifr('2026-05-31')), 'ifr-approaches')).toMatchObject({ current: true, note: 'Needed from December 1, 2026' });
    });

    it('needs 6 approaches only from the first of the seventh month after the check', () => {
      expect(item(items([], ifr('2026-08-15')), 'ifr-approaches')).toMatchObject({ current: true, note: 'Needed from March 1, 2027' });
      expect(item(items([], ifr('2026-04-15')), 'ifr-approaches')).toMatchObject({ current: false, note: '0 of 6 in the last 6 months' });
      const done = [line('2026-10-01', { ftd: 1 }, { approaches: 4 }), line('2026-09-01', { seDayPic: 1, hood: 1 }, { approaches: 2 })];
      expect(item(items(done, ifr('2026-04-15')), 'ifr-approaches').current).toBe(true);
    });
  });
});

describe('the card', () => {
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
  const seed = (p: Partial<Profile>) => saveGuestLogbook({ ...emptyLogbook(), profile: { ...emptyLogbook().profile, ...p } });

  it('isn’t there for a student', async () => {
    seed({});
    render(<App />);
    await screen.findByLabelText('Working on');
    expect(screen.queryByText('Current to fly')).toBeNull();
  });

  it('opens when something needs sorting out, and takes a date', async () => {
    seed({ held: { ppl: { date: '' } } });
    render(<App />);
    const card = (await screen.findByText('Current to fly')).closest('details') as HTMLDetailsElement;
    expect(card.open).toBe(true);
    expect(card.textContent).toContain('to sort out');
    fireEvent.change(within(card).getAllByLabelText('Last done')[0]!, { target: { value: '2026-09-01' } });
    expect(loadGuestLogbook().profile.milestones['recurrent-training']).toEqual({ date: '2026-09-01' });
  });
});
