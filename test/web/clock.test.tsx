import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { setLang } from '../../src/i18n';
import { clearClock, clockHours, clockMinutes, clockStart, startClock } from '../../src/model/clock';
import { today } from '../../src/model/entry';
import { emptyLogbook, loadGuestLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { line } from './fixtures';

const KEY = 'hours-to-go/flight-clock';
const MINUTE = 60_000;

describe('the clock', () => {
  beforeEach(() => localStorage.clear());

  it('keeps when it started, and forgets when cleared', () => {
    expect(clockStart()).toBeNull();
    expect(startClock(1_000_000)).toBe(1_000_000);
    expect(clockStart()).toBe(1_000_000);
    clearClock();
    expect(clockStart()).toBeNull();
  });

  it('ignores anything else in its place', () => {
    localStorage.setItem(KEY, 'nonsense');
    expect(clockStart()).toBeNull();
  });

  it('counts whole minutes, and never backwards', () => {
    expect(clockMinutes(0, 72 * MINUTE)).toBe(72);
    expect(clockMinutes(5 * MINUTE, 0)).toBe(0);
  });

  it('gives the time in tenths of an hour, as a pilot logs it', () => {
    expect(clockHours(72)).toBe('1.2');
    expect(clockHours(74)).toBe('1.2');
    expect(clockHours(75)).toBe('1.3');
  });

  it('uses a decimal comma in French', () => {
    setLang('fr');
    expect(clockHours(72)).toBe('1,2');
    setLang('en');
  });
});

describe('on the screen', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in to continue.' }) })));
    rememberWelcomed();
    saveGuestLogbook(emptyLogbook());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const running = (minutes: number) => localStorage.setItem(KEY, String(Date.now() - minutes * MINUTE));
  const bar = () => screen.findByRole('timer');
  const openForm = async () => {
    render(<App />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Log a flight' }))[0]!);
    return screen.findByRole('dialog');
  };

  it('isn’t there when no flight is being timed', async () => {
    render(<App />);
    await screen.findByLabelText('Working on');
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('starts from the flight form, and closes it', async () => {
    const dialog = await openForm();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Flying now? Start the clock' }));
    expect((await bar()).textContent).toContain('0:00');
    expect(clockStart()).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('is still running after the app is closed and opened again', async () => {
    running(72);
    render(<App />);
    expect((await bar()).textContent).toContain('1:12');
    cleanup();
    render(<App />);
    expect((await bar()).textContent).toContain('1:12');
  });

  it('starts from the next flight, and swaps the + for the way to land', async () => {
    const log = [...Array.from({ length: 14 }, (_, i) => line('2026-10-01', { seDayDual: 1.5 }, { id: `d${i}` })), ...Array.from({ length: 4 }, (_, i) => line('2026-10-02', { seDayPic: 1.5 }, { id: `s${i}`, solo: true }))];
    saveGuestLogbook({ ...emptyLogbook(), entries: log });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start the clock' }));
    expect(within(await bar()).getByRole('button', { name: 'Landed' }).textContent).toContain('0:00');
    expect(document.querySelector('.fab')).toBeNull();
  });

  it('fills in the time on landing, and stops once the flight is saved', async () => {
    running(72);
    render(<App />);
    fireEvent.click(within(await bar()).getByRole('button', { name: 'Landed' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText('Flight time, in hours') as HTMLInputElement).value).toBe('1.2');
    expect(within(dialog).getByText('From the clock')).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText('Dual, with an instructor'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(loadGuestLogbook().entries).toHaveLength(1));
    expect(loadGuestLogbook().entries[0]).toMatchObject({ seDayDual: 72, date: today() });
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
    expect(clockStart()).toBeNull();
  });

  it('keeps running if the form is cancelled, so the time isn’t lost', async () => {
    running(30);
    render(<App />);
    fireEvent.click(within(await bar()).getByRole('button', { name: 'Landed' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(clockStart()).not.toBeNull();
    expect(await bar()).toBeTruthy();
  });

  it('uses the day the flight started, even past midnight', async () => {
    const yesterdayLate = new Date();
    yesterdayLate.setDate(yesterdayLate.getDate() - 1);
    localStorage.setItem(KEY, String(yesterdayLate.getTime()));
    render(<App />);
    fireEvent.click(within(await bar()).getByRole('button', { name: 'Landed' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Dual, with an instructor'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(loadGuestLogbook().entries).toHaveLength(1));
    expect(loadGuestLogbook().entries[0]!.date).toBe(today(yesterdayLate));
  });

  it('can be cancelled', async () => {
    running(10);
    render(<App />);
    fireEvent.click(within(await bar()).getByRole('button', { name: 'Cancel the clock' }));
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
    expect(clockStart()).toBeNull();
  });

  it('asks if it has been forgotten', async () => {
    running(13 * 60);
    render(<App />);
    expect((await bar()).textContent).toContain('Forgot to stop it?');
  });

  it('doesn’t offer a second clock while one is running', async () => {
    running(5);
    const dialog = await openForm();
    expect(within(dialog).queryByRole('button', { name: 'Flying now? Start the clock' })).toBeNull();
  });

  it('starts from the home-screen shortcut', async () => {
    window.history.replaceState(null, '', '/#start');
    render(<App />);
    expect(await bar()).toBeTruthy();
    expect(window.location.hash).toBe('');
  });

  it('doesn’t restart a running clock from the shortcut', async () => {
    running(45);
    window.history.replaceState(null, '', '/#start');
    render(<App />);
    expect((await bar()).textContent).toContain('0:45');
  });
});
