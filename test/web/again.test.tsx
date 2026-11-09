import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { today } from '../../src/model/entry';
import { emptyLogbook, loadGuestLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { line } from './fixtures';

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

const where = { aircraft: 'C172', registration: 'C-GABC', from: 'CYKF', to: 'CYKF' };
const seed = (...entries: ReturnType<typeof line>[]) => saveGuestLogbook({ ...emptyLogbook(), entries });
const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
const save = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
const openFirst = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Edit/ }));
};

describe('logging a flight again', () => {
  it('starts a new line from it, dated today', async () => {
    seed(line('2026-09-01', { seDayPic: 1.4 }, { ...where, solo: true, dayLandings: 6, remarks: 'Circuits' }));
    render(<App />);
    await openFirst();
    fireEvent.click(screen.getByRole('button', { name: 'Log this flight again' }));
    const form = await screen.findByRole('heading', { name: 'Log a flight' });
    expect(form).toBeTruthy();
    expect((screen.getByLabelText('Flight time, in hours') as HTMLInputElement).value).toBe('1.4');
    expect((screen.getByLabelText('Solo') as HTMLInputElement).checked).toBe(true);
    save();
    await closed();
    const [was, now] = loadGuestLogbook().entries;
    expect(now).toMatchObject({ date: today(), seDayPic: 84, solo: true, dayLandings: 6, remarks: '', aircraft: 'C172' });
    expect(now?.id).not.toBe(was?.id);
  });

  it('isn’t offered on paper totals', async () => {
    seed(line('2026-09-01', { seDayDual: 40 }, { forward: true }));
    render(<App />);
    await openFirst();
    expect(screen.queryByRole('button', { name: 'Log this flight again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete this entry' })).toBeTruthy();
  });
});

describe('I flew this', () => {
  const log = [...Array.from({ length: 14 }, () => line('2026-10-01', { seDayDual: 1.5 }, where)), ...Array.from({ length: 4 }, () => line('2026-10-02', { seDayPic: 1.5 }, { ...where, solo: true }))];

  it('opens the form on the suggested flight, and asks where a cross-country went', async () => {
    seed(...log);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'I flew this' }));
    await screen.findByRole('dialog');
    expect((screen.getByLabelText('Dual, with an instructor') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Cross-country') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Hood') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Flight time, in hours') as HTMLInputElement).value).toBe('1.5');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('');
  });
});

describe('what the pace costs', () => {
  it('is the price of the hours at that pace', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    try {
      const weekly = ['09-05', '09-17', '09-24', '10-01', '10-08', '10-15', '10-22', '10-29', '11-05'].map((d) => line(`2026-${d}`, { seDayDual: 1.2 }));
      seed(...weekly);
      render(<App />);
      // 1.2 h a week of dual at $350.30 an hour is about $421 a week; the plan is part solo, so a little less.
      const text = (await screen.findByText(/a month at this pace/)).textContent;
      expect(text).toMatch(/^That’s about \$1,\d{3} a month at this pace\.$/);
    } finally {
      vi.useRealTimers();
    }
  });
});
