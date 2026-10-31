import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from '../../src/api';
import { App } from '../../src/App';
import { emptyLogbook, rememberSignedIn } from '../../src/model/store';

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

let failSaves = false;
/** The profile as the server has it; the account calls below change it as the real one would. */
let account: Account;

beforeEach(() => {
  localStorage.clear();
  rememberSignedIn(true);
  failSaves = false;
  account = { email: 'student@example.com', confirmed: true, pendingEmail: null };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = JSON.parse(String(init?.body ?? 'null'));
      if (url === '/api/me') return reply(200, { user: account });
      if (url === '/api/logbook' && method === 'GET') return reply(200, emptyLogbook());
      if (url === '/api/feedback') return reply(204, null);
      if (url === '/api/account/confirm') return reply(204, null);
      if (url === '/api/account/email') {
        account = { ...account, pendingEmail: method === 'POST' ? body.email : null };
        return reply(200, { user: account });
      }
      if (url === '/api/account/password') {
        return body.password === 'correct horse' ? reply(204, null) : reply(401, { error: 'That password is incorrect.' });
      }
      if (failSaves) throw new TypeError('Failed to fetch');
      return reply(200, body);
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

  it('asks gently to confirm the address, and sends a new link', async () => {
    account = { ...account, confirmed: false };
    render(<App />);
    expect(await screen.findByText(/Confirm your email, so a password reset can reach you/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText(/A new one is on its way/)).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/account/confirm', expect.objectContaining({ method: 'POST' }));
    // Nothing waits for it: the logbook is all there, and the notice goes away until next time.
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(/Confirm your email, so/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Profile/ }));
    expect(screen.getByText('Confirm your email.')).toBeTruthy();
  });

  it('changes the email once the new address is confirmed, and can cancel the change', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Change email' }));
    fireEvent.change(screen.getByLabelText('New email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByText(/Waiting for you to confirm/)).toBeTruthy();
    expect(screen.getByText('new@example.com')).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/account/email',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'new@example.com', password: 'correct horse' }) }),
    );
    expect(screen.queryByLabelText('New email')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel the change' }));
    await waitFor(() => expect(screen.queryByText(/Waiting for you to confirm/)).toBeNull());
  });

  it('changes the password, staying signed in, and says when the old one is wrong', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'not it' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'a new long password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('That password is incorrect.')).toBeTruthy();
    expect(screen.getByText('Saved to your profile')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText(/Your password is changed/)).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/account/password',
      expect.objectContaining({ body: JSON.stringify({ password: 'correct horse', newPassword: 'a new long password' }) }),
    );
  });
});
