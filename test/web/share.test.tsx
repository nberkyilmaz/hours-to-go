import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { emptyLogbook, rememberSignedIn, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { sharedProgress } from '../../src/rules/shared';
import { line, profile } from './fixtures';

const TODAY = '2026-11-08';
const shared = (entries = [line('2026-10-01', { seDayDual: 12 }, { registration: 'C-GSECRET', remarks: 'Private note', dayLandings: 5 })], change = {}) =>
  sharedProgress(entries, profile({ focus: 'ppl', ...change }), TODAY, 'Sam', 1_800_000_000_000);

describe('what a link shows', () => {
  it('gives the goal, how far along, and each requirement', () => {
    const s = shared();
    expect(s).toMatchObject({ name: 'Sam', goal: expect.stringContaining('Private'), asOf: TODAY, complete: false });
    expect(s.percent).toBeGreaterThan(0);
    const time = s.sections.flatMap((x) => x.lines).find((l) => l.unit === 'hours')!;
    expect(time.need).toBeGreaterThan(0);
    expect(typeof time.have).toBe('number');
  });

  it('nests what the standard nests', () => {
    expect(shared().sections.flatMap((x) => x.lines).some((l) => l.depth > 0)).toBe(true);
  });

  it('never carries logbook lines, marks, dates or the medical', () => {
    const text = JSON.stringify(
      shared(undefined, {
        medical: 'cat3',
        medicalUntil: '2029-03-04',
        milestones: { 'exam-ppaer': { date: '2026-02-03', score: 87 } },
        rates: { dual: 111, solo: 222, sim: null, tax: 13 },
      }),
    );
    for (const secret of ['C-GSECRET', 'Private note', '2029-03-04', '2026-02-03', '87', '111', '222', 'cat3']) expect(text).not.toContain(secret);
  });

  it('marks a milestone done without saying when', () => {
    const lines = shared(undefined, { milestones: { 'exam-ppaer': { date: '2026-02-03', score: 87 } } }).sections.flatMap((x) => x.lines);
    expect(lines.find((l) => l.label.startsWith('PPAER'))).toMatchObject({ met: true, have: null, need: null, unit: null });
  });

  it('follows the goal the pilot is working on now', () => {
    expect(shared(undefined, { focus: 'cpl' }).goal).toContain('Commercial');
  });
});

describe('the screens', () => {
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
  const SHARE = { name: 'Sam', expiresAt: Date.UTC(2026, 11, 8, 12) };
  let share: typeof SHARE | null;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    share = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = JSON.parse(String(init?.body ?? 'null'));
        if (url === '/api/shared') return body.token === 'good' ? reply(200, shared()) : reply(404, { error: 'This link has expired or been turned off.' });
        if (url === '/api/me') return reply(200, { user: { email: 'student@example.com', confirmed: true, pendingEmail: null, reminders: false } });
        if (url === '/api/logbook') return reply(200, emptyLogbook());
        if (url === '/api/account/share') {
          if (method === 'POST') {
            share = { ...SHARE, name: body.name };
            return reply(200, { link: 'https://example.test/#share=abc', share });
          }
          if (method === 'DELETE') {
            share = null;
            return reply(204, null);
          }
          return reply(200, { share });
        }
        return reply(200, body);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe('opening a link', () => {
    beforeEach(() => {
      rememberWelcomed();
      saveGuestLogbook(emptyLogbook());
    });

    it('shows the progress, without a profile and without the welcome', async () => {
      window.history.replaceState(null, '', '/#share=good');
      render(<App />);
      expect(await screen.findByRole('heading', { name: /^Sam: / })).toBeTruthy();
      expect(screen.getByText(/nobody has checked it/)).toBeTruthy();
    });

    it('stays in the address bar, so an instructor can come back to it', async () => {
      window.history.replaceState(null, '', '/#share=good');
      render(<App />);
      await screen.findByRole('heading', { name: /^Sam: / });
      expect(window.location.hash).toBe('#share=good');
    });

    it('says so when it has stopped working', async () => {
      window.history.replaceState(null, '', '/#share=bad');
      render(<App />);
      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'This link didn’t work' })).toBeTruthy();
    });
  });

  describe('on the Profile tab', () => {
    const open = async () => {
      rememberSignedIn(true);
      render(<App />);
      fireEvent.click(await screen.findByRole('button', { name: 'Profile' }));
      await screen.findByRole('heading', { name: 'Share with an instructor' });
    };

    it('makes a link, shows it once, and can stop', async () => {
      await open();
      fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: 'Sam' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create a link' }));
      expect(((await screen.findByLabelText('Your link')) as HTMLInputElement).value).toBe('https://example.test/#share=abc');
      expect(screen.getByRole('status').textContent).toContain('as Sam');
      fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
      expect(await screen.findByRole('button', { name: 'Create a link' })).toBeTruthy();
      expect(screen.queryByLabelText('Your link')).toBeNull();
    });

    it('says what is shared before anything is', async () => {
      await open();
      expect(screen.getByText(/Not your logbook lines/)).toBeTruthy();
    });

    it('offers a new link when one is already out', async () => {
      share = SHARE;
      await open();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Make a new link' })).toBeTruthy());
      expect(screen.queryByLabelText('Your link')).toBeNull();
    });
  });

  it('isn’t offered to a guest', async () => {
    rememberWelcomed();
    saveGuestLogbook(emptyLogbook());
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Profile' }));
    await screen.findByRole('heading', { name: 'Your data' });
    expect(screen.queryByRole('heading', { name: 'Share with an instructor' })).toBeNull();
  });
});
