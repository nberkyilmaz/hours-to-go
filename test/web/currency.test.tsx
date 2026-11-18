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

    it('leaves out passengers at night for a pilot with no night rating or night flying', () => {
      expect(items([flight('2026-10-01', 9)]).some((i) => i.id === 'passengers-night')).toBe(false);
      expect(items([flight('2026-10-01', 9)], licensed({ held: { ppl: { date: '2026-01-15' }, night: { date: '2026-03-01' } } })).some((i) => i.id === 'passengers-night')).toBe(true);
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

    describe('lines copied from the paper logbook', () => {
      const paper = totals('2026-10-20', { seDayPic: 100, seNightPic: 5 }, { solo: 'all' }, { dayLandings: 300, nightLandings: 20 });
      const copied = (landings: Profile['landings'], change: Partial<Profile> = {}) => licensed({ landings, ...change });

      it('count, with their dates', () => {
        const p = copied([
          { date: '2026-10-20', day: 3, night: 2, multi: false },
          { date: '2026-09-02', day: 2, night: 3, multi: false },
        ]);
        const list = items([paper], p);
        // By day, night landings count too: the first line has 5.
        expect(item(list, 'passengers-day')).toMatchObject({ current: true, until: '2027-04-20', landings: true });
        expect(item(list, 'passengers-night')).toMatchObject({ current: true, until: '2027-03-02' });
      });

      it('count only up to the paper totals, since after them the flights are in the app', () => {
        const p = copied([{ date: '2026-11-01', day: 9, night: 0, multi: false }]);
        expect(item(items([paper], p), 'passengers-day')).toMatchObject({ current: false, note: '0 of 5 in the last 6 months' });
        expect(item(items([], p), 'passengers-day')).toMatchObject({ current: false, landings: false });
      });

      it('add up with flights logged one by one', () => {
        const p = copied([{ date: '2026-10-10', day: 3, night: 0, multi: false }]);
        expect(item(items([paper, flight('2026-11-01', 2)], p), 'passengers-day')).toMatchObject({ current: true, until: '2027-04-10' });
      });

      it('keep a multi-engine line apart', () => {
        const p = copied([{ date: '2026-10-10', day: 6, night: 0, multi: true }]);
        const list = items([paper], p);
        expect(item(list, 'passengers-day-multi').current).toBe(true);
        expect(item(list, 'passengers-day').current).toBe(false);
      });
    });
  });

  describe('the medical', () => {
    it('asks for it when it isn’t there', () => {
      expect(item(items([]), 'medical')).toMatchObject({ current: false, medical: true, note: 'Add your medical: its category and the date of the exam.' });
    });

    it('holds for private flying with a PPL, and adds commercial flying with a CPL', () => {
      const ppl = licensed({ medical: 'cat1', medicalExam: '2025-10-15' });
      expect(items([], ppl).filter((i) => i.medical).map((i) => [i.id, i.current, i.until])).toEqual([['medical', true, '2030-10-31']]);
      const cpl = licensed({ medical: 'cat1', medicalExam: '2025-10-15', held: { ppl: { date: '2024-01-15' }, cpl: { date: '2025-06-01' } } });
      expect(items([], cpl).filter((i) => i.medical).map((i) => [i.id, i.current, i.until])).toEqual([
        ['medical-commercial', false, '2026-10-31'],
        ['medical', true, '2030-10-31'],
      ]);
    });

    it('says a Category 3 doesn’t give commercial privileges', () => {
      const cpl = licensed({ medical: 'cat3', medicalExam: '2025-10-15', held: { ppl: { date: '2024-01-15' }, cpl: { date: '2025-06-01' } } });
      expect(item(items([], cpl), 'medical-commercial')).toMatchObject({ current: false, until: null, note: 'Commercial privileges need a Category 1 medical.' });
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
      expect(item(items([]), 'recurrent')).toMatchObject({ current: true, until: '2028-01-15', from: 'Counted from your PPL, issued January 15, 2026.' });
    });

    it('says when a flight test is where the date came from', () => {
      const p = licensed({ milestones: { 'test-ppl': { date: '2026-11-08' } } });
      expect(item(items([], p), 'recurrent')).toMatchObject({ until: '2028-11-08', from: 'Counted from your PPL flight test, November 8, 2026.' });
    });

    it('takes the date the pilot enters, the latest of them', () => {
      const p = licensed({ held: { ppl: { date: '2020-01-01' } }, milestones: { 'recurrent-training': { date: '2026-03-01' } } });
      expect(item(items([], p), 'recurrent')).toMatchObject({ current: true, until: '2028-03-01', from: null });
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
  const seed = (p: Partial<Profile>, entries: ReturnType<typeof line>[] = []) => saveGuestLogbook({ ...emptyLogbook(), entries, profile: { ...emptyLogbook().profile, ...p } });

  it('isn’t there for a student', async () => {
    seed({});
    render(<App />);
    await screen.findByLabelText('Working on');
    expect(screen.queryByText('Current to fly')).toBeNull();
  });

  it('opens when something needs sorting out, and takes a date', async () => {
    seed({ held: { ppl: { date: '' } } }, [line('2026-01-01', { seDayPic: 1 })]);
    render(<App />);
    const card = (await screen.findByText('Current to fly')).closest('details') as HTMLDetailsElement;
    expect(card.open).toBe(true);
    expect(card.textContent).toContain('to sort out');
    fireEvent.change(within(card).getAllByLabelText('Last done')[0]!, { target: { value: '2026-09-01' } });
    expect(loadGuestLogbook().profile.milestones['recurrent-training']).toEqual({ date: '2026-09-01' });
  });

  it('opens on paper totals alone, and takes the last lines of the paper logbook', async () => {
    seed({ held: { ppl: { date: '2025-01-15' } }, medical: 'cat3', medicalExam: '2025-01-10' }, [line('2026-10-20', { seDayPic: 100 }, { forward: true, dayLandings: 300 })]);
    render(<App />);
    const card = (await screen.findByText('Current to fly')).closest('details') as HTMLDetailsElement;
    expect(card.open).toBe(true);
    expect(card.textContent).not.toContain('log a flight to check');
    fireEvent.change(within(card).getByLabelText('Date'), { target: { value: '2026-11-01' } });
    fireEvent.change(within(card).getByLabelText('By day'), { target: { value: '5' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Add this line' }));
    expect(within(card).getByRole('alert').textContent).toContain('after your paper totals, which go up to October 20, 2026');
    fireEvent.change(within(card).getByLabelText('Date'), { target: { value: '2026-10-20' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Add this line' }));
    expect(loadGuestLogbook().profile.landings).toEqual([{ date: '2026-10-20', day: 5, night: 0, multi: false }]);
    expect(await within(card).findByText(/Takeoffs and landings from your paper logbook \(1\)/)).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: 'Remove the line of October 20, 2026' }));
    expect(loadGuestLogbook().profile.landings).toEqual([]);
  });

  it('asks for the medical when there’s none', async () => {
    seed({ held: { ppl: { date: '2025-01-15' } } }, [line('2026-10-20', { seDayPic: 1 })]);
    render(<App />);
    const card = (await screen.findByText('Current to fly')).closest('details') as HTMLDetailsElement;
    fireEvent.change(within(card).getByLabelText('Your medical'), { target: { value: 'cat1' } });
    fireEvent.change(await within(card).findByLabelText('Date of the exam'), { target: { value: '2026-01-10' } });
    expect(loadGuestLogbook().profile).toMatchObject({ medical: 'cat1', medicalExam: '2026-01-10' });
  });
});
