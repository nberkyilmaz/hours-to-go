import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../src/api';
import { App } from '../../src/App';
import { emptyLogbook, rememberSignedIn } from '../../src/model/store';
import { comingUp, toSend, type Due } from '../../src/rules/reminders';
import { profile } from './fixtures';

const TODAY = '2026-11-08';
const due = (change: Partial<Profile>) => comingUp([], profile(change), TODAY);
type Profile = Parameters<typeof profile>[0] & object;

describe('what is coming up', () => {
  it('finds a medical from 30 days out, up to its last day', () => {
    expect(due({ medical: 'cat3', medicalUntil: '2026-12-08' })).toMatchObject([{ key: 'medical', daysLeft: 30, until: '2026-12-08' }]);
    expect(due({ medical: 'cat3', medicalUntil: '2026-12-09' })).toEqual([]);
    expect(due({ medical: 'cat3', medicalUntil: TODAY })).toMatchObject([{ daysLeft: 0 }]);
    expect(due({ medical: 'cat3', medicalUntil: '2026-11-07' })).toEqual([]);
  });

  it('finds an exam result running out, by a short name', () => {
    expect(due({ milestones: { 'exam-ppaer': { date: '2024-12-01', score: 80 } } })).toMatchObject([{ key: 'exam-ppaer', what: 'PPAER written exam', until: '2026-12-01', daysLeft: 23 }]);
  });

  it('leaves out a result too low to count, and one a licence has made permanent', () => {
    expect(due({ milestones: { 'exam-ppaer': { date: '2024-12-01', score: 40 } } })).toEqual([]);
    expect(due({ held: { ppl: { date: '2026-01-01' } }, milestones: { 'exam-ppaer': { date: '2024-12-01', score: 80 } } }).some((d) => d.key === 'exam-ppaer')).toBe(false);
  });

  it('gives a letter one reminder a week out, since it only lasts weeks', () => {
    expect(due({ milestones: { 'letter-ppaer': { date: '2026-09-14' } } })).toMatchObject([{ key: 'letter-ppaer', daysLeft: 5, steps: [7] }]);
    expect(due({ milestones: { 'letter-ppaer': { date: '2026-10-01' } } })).toEqual([]);
  });

  it('adds recurrent training and the instrument check for a licensed pilot', () => {
    expect(due({ held: { ppl: { date: '2024-12-01' } } }).map((d) => d.key)).toEqual(['recurrent']);
    const keys = due({ held: { ppl: { date: '2020-01-01' }, ifr3: { date: '2024-11-20' } } }).map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(['recurrent', 'ifr-check']));
  });

  it('lists something once when several goals ask for it, soonest first', () => {
    const list = due({ medical: 'cat1', medicalUntil: '2026-12-05', milestones: { 'exam-inrat': { date: '2024-11-20', score: 90 } } });
    expect(list.map((d) => d.key)).toEqual(['exam-inrat', 'medical']);
  });
});

describe('what to send', () => {
  const item = (daysLeft: number, until = '2026-12-01'): Due => ({ key: 'medical', what: 'Your medical certificate', until, daysLeft, steps: [30, 7] });
  const once = (marks: string[]) => new Set(marks);

  it('says it once at each step', () => {
    const first = toSend([item(20)], new Set());
    expect(first.items).toHaveLength(1);
    expect(first.marks).toEqual(['medical|2026-12-01|30']);
    expect(toSend([item(19)], once(first.marks)).items).toEqual([]);
    const second = toSend([item(6)], once(first.marks));
    expect(second.items).toHaveLength(1);
    expect(toSend([item(5)], once([...first.marks, ...second.marks])).items).toEqual([]);
  });

  it('sends one email when first seen late, not one per step', () => {
    const late = toSend([item(5)], new Set());
    expect(late.marks).toEqual(['medical|2026-12-01|30', 'medical|2026-12-01|7']);
    expect(toSend([item(4)], once(late.marks)).items).toEqual([]);
  });

  it('starts over once the date changes', () => {
    expect(toSend([item(20, '2026-12-02')], once(['medical|2026-12-01|30'])).items).toHaveLength(1);
  });
});

describe('the switch', () => {
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
  let account: Account;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    rememberSignedIn(true);
    account = { email: 'student@example.com', confirmed: true, pendingEmail: null, reminders: false };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? 'null'));
        if (url === '/api/me') return reply(200, { user: account });
        if (url === '/api/logbook') return reply(200, emptyLogbook());
        if (url === '/api/account/reminders') {
          account = { ...account, reminders: body.on };
          return reply(200, { user: account });
        }
        if (url === '/api/reminders/off') return body.token === 'good' ? reply(204, null) : reply(400, { error: 'This link didn’t work.' });
        return reply(200, body);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const openProfile = async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Profile' }));
    return (await screen.findByLabelText(/Email me before/)) as HTMLInputElement;
  };

  it('is off until the pilot turns it on', async () => {
    const box = await openProfile();
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(true));
    expect(account.reminders).toBe(true);
  });

  it('waits for a confirmed email', async () => {
    account = { ...account, confirmed: false };
    const box = await openProfile();
    expect(box.disabled).toBe(true);
    expect(screen.getByText(/Confirm your email first/)).toBeTruthy();
  });

  it('turns off from the link in an email', async () => {
    window.history.replaceState(null, '', '/#stop=good');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Reminders are off' })).toBeTruthy();
  });

  it('says so when the link is no good', async () => {
    window.history.replaceState(null, '', '/#stop=bad');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'This link didn’t work' })).toBeTruthy();
  });
});
