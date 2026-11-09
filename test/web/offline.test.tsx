import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import type { Entry } from '../../src/model/entry';
import { blankProfile, type Profile } from '../../src/model/profile';
import { rememberSignedIn } from '../../src/model/store';
import { loadCopy } from '../../src/model/sync';

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

/** The server as a signed-in pilot's other devices left it. */
let server: { entries: Entry[]; profile: Profile };
let online: boolean;
let signedIn: boolean;
let refuse: string | null;

beforeEach(() => {
  localStorage.clear();
  rememberSignedIn(true);
  server = { entries: [], profile: blankProfile() };
  online = true;
  signedIn = true;
  refuse = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!online) throw new TypeError('Failed to fetch');
      const method = init?.method ?? 'GET';
      const body = JSON.parse(String(init?.body ?? 'null'));
      if (url === '/api/auth/login') {
        signedIn = true;
        return reply(200, { user: { email: 'student@example.com', confirmed: true, pendingEmail: null } });
      }
      if (!signedIn) return reply(401, { error: 'Sign in to continue.' });
      if (url === refuse) return reply(400, { error: 'That entry is not valid.' });
      if (url === '/api/me') return reply(200, { user: { email: 'student@example.com', confirmed: true, pendingEmail: null } });
      if (url === '/api/logbook') return reply(200, { version: 2, ...server });
      if (url === '/api/profile') {
        server.profile = body;
        return reply(200, body);
      }
      if (url === '/api/auth/logout') return reply(204, null);
      const id = decodeURIComponent(url.replace('/api/entries/', ''));
      server.entries = server.entries.filter((e) => e.id !== id);
      if (method === 'PUT') server.entries.push(body);
      return reply(method === 'PUT' ? 200 : 204, method === 'PUT' ? body : null);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function logFlight(hours: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Logbook/ }));
  fireEvent.click(screen.getAllByRole('button', { name: /Log a flight/ })[0]!);
  fireEvent.click(screen.getByRole('button', { name: 'Paper columns' }));
  fireEvent.change(screen.getByLabelText('Single-engine day Dual'), { target: { value: hours } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

const backOnline = () => {
  online = true;
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
};

describe('signed in with no connection', () => {
  it('keeps a flight on this device, says so, and sends it when the connection comes back', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Saved to your profile' });
    online = false;
    await logFlight('1.2');

    // Shown, kept, and waiting: nothing reverted, nothing lost.
    expect(await screen.findByRole('button', { name: 'Offline. 1 change kept on this device' })).toBeTruthy();
    expect(screen.getByText(/You’re offline/).textContent).toMatch(/Your change is kept on this device/);
    expect(screen.getByRole('list', { name: 'Logbook entries' }).querySelectorAll('.log-entry')).toHaveLength(1);
    expect(loadCopy()?.ops).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();

    backOnline();
    await screen.findByRole('button', { name: 'Saved to your profile' });
    expect(server.entries.map((e) => e.seDayDual)).toEqual([72]);
    expect(loadCopy()?.ops).toEqual([]);
  });

  it('opens on this device’s copy with no connection, then sends what waited on top of the newest profile', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Saved to your profile' });
    online = false;
    fireEvent.change(screen.getByLabelText('Working on'), { target: { value: 'cpl' } });
    await screen.findByRole('button', { name: 'Offline. 1 change kept on this device' });

    // The app is closed and opened again, still with no signal: the pilot's own logbook, at once.
    cleanup();
    render(<App />);
    expect(screen.queryByText('Loading your logbook…')).toBeNull();
    expect((screen.getByLabelText('Working on') as HTMLSelectElement).value).toBe('cpl');
    expect(await screen.findByRole('button', { name: 'Offline. 1 change kept on this device' })).toBeTruthy();

    // Meanwhile the laptop changed the medical; the phone's change goes on top of it.
    server.profile = { ...server.profile, medical: 'cat1' };
    backOnline();
    await screen.findByRole('button', { name: 'Saved to your profile' });
    expect(server.profile).toEqual({ ...blankProfile(), medical: 'cat1', focus: 'cpl' });
    expect((screen.getByLabelText('Working on') as HTMLSelectElement).value).toBe('cpl');
  });

  it('says when the server refuses a change, drops it, and shows what the profile has', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Saved to your profile' });
    refuse = '/api/profile';
    fireEvent.change(screen.getByLabelText('Working on'), { target: { value: 'ifr3' } });
    expect(await screen.findByText('That entry is not valid. That change was not saved.')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Working on') as HTMLSelectElement).value).toBe('ppl'));
    expect(loadCopy()?.ops).toEqual([]);
  });

  it('won’t sign out with changes still to send, and signing out takes the profile off the device', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Saved to your profile' });
    online = false;
    await logFlight('1.0');
    fireEvent.click(screen.getByRole('button', { name: /^Profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText(/Some changes aren’t in your profile yet/)).toBeTruthy();

    online = true;
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('Saved on this device only');
    expect(server.entries).toHaveLength(1);
    expect(loadCopy('student@example.com')).toBeNull();
  });

  it('keeps changes made before the session ended, and sends them after signing in again', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Saved to your profile' });
    online = false;
    await logFlight('1.5');
    signedIn = false;
    backOnline();
    expect(await screen.findByText('You were signed out. Sign in again to save the change made on this device.')).toBeTruthy();
    expect(server.entries).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^Profile/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(server.entries.map((e) => e.seDayDual)).toEqual([90]));
  });
});
