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
      if (url === '/api/feedback') return reply(204, null);
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

  it('sends feedback with the profile’s address to reply to, without asking for one', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Profile/ }));
    expect(screen.queryByLabelText('Your email, if you’d like a reply')).toBeNull();
    expect(screen.getByText('Replies go to student@example.com.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Love it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Thanks, your message was sent. Any reply will go to student@example.com.')).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({ body: JSON.stringify({ message: 'Love it', email: '' }) }));
  });
});
