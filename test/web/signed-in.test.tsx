import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { emptyLogbook, rememberSignedIn } from '../../src/model/store';

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

let failSaves = false;

beforeEach(() => {
  localStorage.clear();
  rememberSignedIn(true);
  failSaves = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/me') return reply(200, { user: { email: 'student@example.com' } });
      if (url === '/api/logbook' && method === 'GET') return reply(200, emptyLogbook());
      if (failSaves) throw new TypeError('Failed to fetch');
      return reply(200, JSON.parse(String(init?.body ?? 'null')));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('signed in', () => {
  it('saves to the profile, not to this browser', async () => {
    render(<App />);
    expect(await screen.findByText('Saved to your profile')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Working on'), { target: { value: 'cpl' } });
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'PUT' })));
    expect(localStorage.getItem('hours-to-go/v1')).toBeNull();
  });

  it('shows a change at once, and puts the server copy back if the save fails', async () => {
    render(<App />);
    const picker = (await screen.findByLabelText('Working on')) as HTMLSelectElement;
    failSaves = true;
    fireEvent.change(picker, { target: { value: 'ifr3' } });
    expect(picker.value).toBe('ifr3');
    expect(await screen.findByText(/Your last change was not saved/)).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Working on') as HTMLSelectElement).value).toBe('ppl'));
  });
});
