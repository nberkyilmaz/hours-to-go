import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { doubtsAbout } from '../../src/model/entry';
import { emptyLogbook, isSnoozed, rememberWelcomed, saveGuestLogbook, snooze } from '../../src/model/store';
import { line } from './fixtures';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in to continue.' }) })),
  );
  rememberWelcomed();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function openForm() {
  saveGuestLogbook({ ...emptyLogbook(), entries: [line('2026-10-01', { seDayDual: 1.2 })] });
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
  fireEvent.click(screen.getByRole('button', { name: /Log a flight/ }));
  return screen.getByRole('dialog');
}
const save = (dialog: HTMLElement, name: string | RegExp = 'Save') => fireEvent.click(within(dialog).getByRole('button', { name }));
const gone = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

describe('a save that fails', () => {
  it('says so by the buttons, puts the message by the time, and goes to the box', async () => {
    const dialog = await openForm();
    save(dialog);
    expect(within(dialog).getByRole('alert').textContent).toBe('1 thing to fix');
    const heading = within(dialog).getByRole('heading', { name: 'Flight time' });
    expect(heading.nextElementSibling?.textContent).toMatch(/Enter the time in one of the flight-time columns/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Single-engine day Dual')));
  });

  it('ties a box’s message to it, and goes to the box that is wrong', async () => {
    const dialog = await openForm();
    type('Single-engine day Dual', '1.0');
    type('Cross-country day Dual', '1:30');
    save(dialog);
    const box = screen.getByLabelText('Cross-country day Dual');
    await waitFor(() => expect(document.activeElement).toBe(box));
    expect(document.getElementById(box.getAttribute('aria-describedby')!)?.textContent).toMatch(/More than the day dual time/);
  });
});

describe('leaving the form', () => {
  const cancel = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

  it('closes at once when nothing was typed', async () => {
    const dialog = await openForm();
    cancel(dialog);
    await gone();
  });

  it('asks before throwing away a typed flight, from Cancel, Esc and outside the form', async () => {
    const dialog = await openForm();
    type('Single-engine day Dual', '1.3');
    cancel(dialog);
    expect(within(dialog).getByRole('alert').textContent).toBe('Discard this flight?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect((screen.getByLabelText('Single-engine day Dual') as HTMLInputElement).value).toBe('1.3');

    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Discard this flight?');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(within(dialog).queryByRole('alert')).toBeNull();

    fireEvent.click(dialog);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await gone();
  });

  it('treats Back as leaving the form, not the app', async () => {
    const dialog = await openForm();
    window.dispatchEvent(new PopStateEvent('popstate'));
    await gone();

    fireEvent.click(screen.getByRole('button', { name: /Log a flight/ }));
    const again = screen.getByRole('dialog');
    type('Single-engine day Dual', '1.3');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect((await within(again).findByRole('alert')).textContent).toBe('Discard this flight?');
    expect(dialog.isConnected).toBe(false);
  });
});

describe('numbers that look wrong', () => {
  it('asks once about a very long flight, and keeps it if told to', async () => {
    const dialog = await openForm();
    type('Single-engine day Dual', '13');
    save(dialog);
    expect(within(dialog).getByRole('alert').textContent).toBe('13.0 h on one flight? Did you mean 1.3?');
    save(dialog, 'Save anyway');
    await gone();
    expect(screen.getByRole('list', { name: 'Logbook entries' }).textContent).toContain('13.0');
  });

  it('stops asking once the number is fixed', async () => {
    const dialog = await openForm();
    type('Single-engine day Dual', '13');
    save(dialog);
    type('Single-engine day Dual', '1.3');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    save(dialog);
    await gone();
  });

  it('are a long flight or a date ahead of today, and paper totals may be any length', () => {
    const today = '2026-11-08';
    expect(doubtsAbout(line(today, { seDayDual: 8 }), today)).toEqual([]);
    expect(doubtsAbout(line(today, { seDayDual: 9 }), today)).toEqual(['9.0 h on one flight? Did you mean 0.9?']);
    expect(doubtsAbout(line('2026-11-09', { seDayDual: 1 }), today)).toEqual(['That date is in the future.']);
    expect(doubtsAbout(line(today, { seDayDual: 400 }, { forward: true }), today)).toEqual([]);
  });

  it('keeps an exam mark to a percentage', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: { ...emptyLogbook().profile, milestones: { 'exam-ppaer': { date: '2026-10-01' } } } });
    render(<App />);
    const mark = (await screen.findByLabelText('Mark %')) as HTMLInputElement;
    fireEvent.change(mark, { target: { value: '150' } });
    expect((screen.getByLabelText('Mark %') as HTMLInputElement).value).toBe('100');
  });
});

describe('notices', () => {
  it('remembers Later for two weeks', () => {
    const now = Date.parse('2026-11-08T12:00:00Z');
    expect(isSnoozed('x', now)).toBe(false);
    snooze('x', now);
    expect(isSnoozed('x', now + 13 * 86_400_000)).toBe(true);
    expect(isSnoozed('x', now + 15 * 86_400_000)).toBe(false);
  });

  it('keeps Later after the app is closed', async () => {
    saveGuestLogbook({ ...emptyLogbook(), entries: [line('2026-10-01', { seDayDual: 1.2 })] });
    render(<App />);
    expect(await screen.findByText(/Your logbook is only on this device/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(/Your logbook is only on this device/)).toBeNull();
    cleanup();
    render(<App />);
    await screen.findByLabelText('Working on');
    expect(screen.queryByText(/Your logbook is only on this device/)).toBeNull();
  });
});

describe('the logbook', () => {
  it('shows only the columns with something in them', async () => {
    saveGuestLogbook({ ...emptyLogbook(), entries: [line('2026-10-01', { seDayDual: 1.2 })] });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
    const row = screen.getByRole('list', { name: 'Logbook entries' }).firstElementChild as HTMLElement;
    expect([...row.querySelectorAll('[data-label]')].map((c) => c.getAttribute('data-label'))).toEqual(['Dual']);
  });
});
