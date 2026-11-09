import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { blankQuick, quickFrom, quickText } from '../../src/model/quick';
import { emptyLogbook, loadGuestLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { goalById } from '../../src/rules/goals';
import { momentOf } from '../../src/rules/moment';
import { goalProgress } from '../../src/rules/progress';
import { line, profile, totals } from './fixtures';

/** A flight that gives the next one its aircraft and field. */
const usualFlight = () => line('2026-10-01', { seDayDual: 1.2 }, { aircraft: 'C172', registration: 'C-GABC', from: 'CYKF', to: 'CYKF' });
const quick = (change: Partial<ReturnType<typeof blankQuick>>) => ({ ...blankQuick(), ...change });
/** Only the boxes with something in them. */
const filled = (t: Record<string, string>) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== ''));

describe('the quick form’s choices', () => {
  it('fill the paper columns a flight belongs in', () => {
    expect(filled(quickText(quick({ kind: 'dual', time: '1.3' })))).toEqual({ seDayDual: '1.3', dayLandings: '1' });
    expect(filled(quickText(quick({ kind: 'solo', time: '1.0', landings: 4 })))).toEqual({ seDayPic: '1.0', dayLandings: '4' });
    expect(filled(quickText(quick({ kind: 'pic', time: '2.1', night: true, xc: true })))).toEqual({ seNightPic: '2.1', xcNightPic: '2.1', nightLandings: '1' });
    expect(filled(quickText(quick({ kind: 'dual', time: '1.5', xc: true, hood: true, hoodTime: '0.5' })))).toEqual({ seDayDual: '1.5', xcDayDual: '1.5', hood: '0.5', dayLandings: '1' });
  });

  it('count a hood flight as all of it unless told otherwise, and need a kind', () => {
    expect(quickText(quick({ kind: 'dual', time: '1.2', hood: true })).hood).toBe('1.2');
    expect(filled(quickText(quick({ time: '1.2' })))).toEqual({ dayLandings: '1' });
  });

  it('read back from a line of that shape', () => {
    expect(quickFrom(line('2026-10-01', { seDayDual: 1.3 }, { dayLandings: 4 }))).toEqual(quick({ kind: 'dual', time: '1.3', landings: 4 }));
    expect(quickFrom(line('2026-10-01', { seNightPic: 1, xcNightPic: 1 }, { solo: true, nightLandings: 9 }))).toEqual(quick({ kind: 'solo', time: '1.0', night: true, xc: true, landings: 9 }));
    expect(quickFrom(line('2026-10-01', { seDayDual: 1.5, hood: 0.5 }))).toEqual(quick({ kind: 'dual', time: '1.5', hood: true, hoodTime: '0.5', landings: 0 }));
  });

  it('leave anything else to the paper columns', () => {
    expect(quickFrom(line('2026-10-01', { seDayDual: 1, seNightDual: 1 }))).toBeNull();
    expect(quickFrom(line('2026-10-01', { meDayDual: 1 }))).toBeNull();
    expect(quickFrom(line('2026-10-01', { seDayDual: 2, xcDayDual: 1 }))).toBeNull();
    expect(quickFrom(line('2026-10-01', { seDayDual: 1, actualImc: 0.5 }))).toBeNull();
    expect(quickFrom(line('2026-10-01', { ftd: 1 }))).toBeNull();
    expect(quickFrom(totals('2026-10-01', { seDayDual: 40 }))).toBeNull();
  });
});

describe('the moment after logging', () => {
  const ppl = goalById('ppl');
  const today = '2026-11-08';

  it('says how much closer the goal is, and what the flight finished', () => {
    const log = [line('2026-10-01', { seDayDual: 16 })];
    const m = momentOf(ppl, log, line(today, { seDayDual: 1.3 }), profile(), today);
    expect(m).toMatchObject({ short: 'PPL', was: 29 * 60, now: 27.7 * 60, complete: false });
    expect(m?.finished).toEqual(['17 h dual instruction']);
  });

  it('is nothing for a goal already held', () => {
    expect(momentOf(ppl, [], line(today, { seDayDual: 1 }), profile({ held: { ppl: { date: '' } } }), today)).toBeNull();
  });
});

describe('logging a flight', () => {
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

  const open = async () => {
    fireEvent.click((await screen.findAllByRole('button', { name: /Log a flight/ }))[0]!);
    return screen.getByRole('dialog');
  };
  const pick = (dialog: HTMLElement, label: string) => fireEvent.click(within(dialog).getByLabelText(label));
  const time = (value: string) => fireEvent.change(screen.getByLabelText('Flight time, in hours'), { target: { value } });
  const save = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const seed = (...entries: ReturnType<typeof line>[]) => saveGuestLogbook({ ...emptyLogbook(), entries });

  it('gives the same hours to go as Progress does', () => {
    const night = goalById('night');
    const flown = [line('2026-10-01', { seDayDual: 1.5 }, { hood: 90 })];
    const held = profile({ held: { ppl: { date: '2025-01-01' } }, focus: 'night' });
    const moment = momentOf(night, flown, line('2026-10-02', { seNightDual: 1.5 }), held, '2026-11-08')!;
    expect(moment.now).toBe(goalProgress(night, [...flown, line('2026-10-02', { seNightDual: 1.5 })], held, '2026-11-08').left);
  });

  it('doesn’t offer the way to Progress from Progress', async () => {
    seed(usualFlight());
    render(<App />);
    const dialog = await open();
    pick(dialog, 'Dual, with an instructor');
    time('1.3');
    save(dialog);
    await closed();
    expect(within(screen.getByRole('status')).queryByRole('button', { name: 'See progress' })).toBeNull();
  });

  it('takes a kind and a time from any tab, says what it did, and can be undone', async () => {
    seed(usualFlight());
    render(<App />);
    const dialog = await open();
    expect(document.activeElement).toBe(screen.getByLabelText('Flight time, in hours'));
    pick(dialog, 'Dual, with an instructor');
    time('1.3');
    save(dialog);
    await closed();
    const flights = loadGuestLogbook().entries;
    expect(flights).toHaveLength(2);
    expect(flights[1]).toMatchObject({ seDayDual: 78, dayLandings: 1, aircraft: 'C172', from: 'CYKF', to: 'CYKF' });

    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('1.3 h logged. PPL: 42.5 h to go, was 43.8.');
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(loadGuestLogbook().entries).toHaveLength(1));
  });

  it('won’t guess who was flying', async () => {
    seed(usualFlight());
    render(<App />);
    const dialog = await open();
    time('1.3');
    save(dialog);
    expect(await within(dialog).findByText('Choose Dual, Solo or PIC, and enter the time.')).toBeTruthy();
    expect(loadGuestLogbook().entries).toHaveLength(1);
  });

  it('logs solo as PIC time with the solo tick, without the pilot knowing the columns', async () => {
    seed(usualFlight());
    render(<App />);
    const dialog = await open();
    pick(dialog, 'Solo');
    time('1.0');
    save(dialog);
    await waitFor(() => expect(loadGuestLogbook().entries).toHaveLength(2));
    expect(loadGuestLogbook().entries[1]).toMatchObject({ seDayPic: 60, solo: true });
  });

  it('shows the same flight in the paper columns', async () => {
    seed(usualFlight());
    render(<App />);
    const dialog = await open();
    pick(dialog, 'Dual, with an instructor');
    time('2.1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Paper columns' }));
    expect((screen.getByLabelText('Single-engine day Dual') as HTMLInputElement).value).toBe('2.1');
    expect(screen.queryByLabelText('Flight time, in hours')).toBeNull();
  });

  it('asks where a cross-country went', async () => {
    seed(usualFlight());
    render(<App />);
    const dialog = await open();
    pick(dialog, 'Cross-country');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('');
  });

  it('opens a flight of the ordinary shape in the quick form, and any other in the columns', async () => {
    seed(line('2026-10-01', { seDayDual: 1.3 }), line('2026-09-01', { seDayDual: 1, seNightDual: 1 }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
    const [plain, mixed] = screen.getAllByRole('button', { name: /^Edit/ });
    fireEvent.click(plain!);
    expect((screen.getByLabelText('Flight time, in hours') as HTMLInputElement).value).toBe('1.3');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await closed();
    fireEvent.click(mixed!);
    expect(screen.queryByLabelText('Flight time, in hours')).toBeNull();
    expect((screen.getByLabelText('Single-engine night Dual') as HTMLInputElement).value).toBe('1.0');
  });

  it('deletes at once, and offers the flight back', async () => {
    seed(usualFlight());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Edit/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete this entry' }));
    await waitFor(() => expect(loadGuestLogbook().entries).toHaveLength(0));
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(loadGuestLogbook().entries).toHaveLength(1));
  });

  it('opens the form from the home-screen shortcut', async () => {
    seed(usualFlight());
    window.history.replaceState(null, '', '/#log');
    render(<App />);
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(window.location.hash).toBe('');
  });
});
