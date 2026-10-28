import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { emptyLogbook, rememberSignedIn, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';

// No server in these tests: every call answers "not signed in", so the app runs as a guest.
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in to continue.' }) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('the app as a guest', () => {
  // Past the welcome screen, as a guest who chose to go on without a profile.
  beforeEach(() => rememberWelcomed());

  it('takes paper logbook totals and shows what is left for IFR Group 3', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Add my hours/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/total to date/)).toBeTruthy();
    type('Single-engine day PIC', '40');
    type('Single-engine night PIC', '5');
    type('Cross-country day PIC', '26');
    expect(within(dialog).getByText(/Flight time on this line/).textContent).toContain('45.0 h');
    fireEvent.click(within(dialog).getByLabelText('All of it'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('list', { name: 'Logbook entries' }).textContent).toContain('Brought forward');

    fireEvent.click(screen.getByRole('button', { name: /Progress/ }));
    fireEvent.change(screen.getByLabelText('Working on'), { target: { value: 'ifr3' } });
    await screen.findByRole('heading', { name: 'Instrument Rating — Group 3' });
    expect(screen.getByText(/26\.0 \/ 50\.0/)).toBeTruthy();
    expect(screen.getAllByText(/24\.0 h to go/).length).toBeGreaterThan(0);

    // It survives a reload: the guest logbook is in this browser.
    cleanup();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
    expect(screen.getByRole('list', { name: 'Logbook entries' }).children).toHaveLength(1);
  });

  it('will not save cross-country time longer than the flight it is part of', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
    fireEvent.click(screen.getByRole('button', { name: /Log a flight/ }));
    type('Single-engine day Dual', '1.0');
    type('Cross-country day Dual', '1:30');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/More than the day dual time on this line/)).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('logs an FTD session as ground time, not flight time', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Logbook/ }));
    fireEvent.click(screen.getByRole('button', { name: /Log FTD session/ }));
    type('FTD session FTD', '1.5');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('list', { name: 'Logbook entries' }).textContent).toContain('1.5 FTD');
    expect(screen.getAllByText('Grand total')[0]?.nextElementSibling?.textContent).toBe('0.0');
  });

  it('takes paper totals in one entry, with the questions the columns can’t answer', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark PPL as held' }));
    fireEvent.click(await screen.findByRole('button', { name: /Add my hours/ }));
    type('Single-engine day Dual', '40');
    type('Single-engine night Dual', '5');
    type('Single-engine night PIC', '3.5');
    type('Takeoffs & landings Night', '34');
    expect(screen.queryByLabelText(/How many of the 34 night takeoffs/)).toBeNull();

    // Saving before answering points at the questions.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/so the solo requirements count the right time/)).toBeTruthy();
    expect(screen.getByText(/so the CPL counts only what came after your PPL/)).toBeTruthy();

    fireEvent.click(within(screen.getByRole('group', { name: /How much of your 3\.5 h of PIC time was solo/ })).getByLabelText('All of it'));
    fireEvent.click(within(screen.getByRole('group', { name: /after your PPL was issued/ })).getByLabelText('None of it'));
    type(/How many of the 34 night takeoffs/, '12');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Progress/ }));
    fireEvent.change(screen.getByLabelText('Working on'), { target: { value: 'night' } });
    await screen.findByRole('heading', { name: 'Night Rating — Aeroplane' });
    expect(screen.getByText(/^12 \/ 10/)).toBeTruthy();
    expect(screen.getByText(/^3\.5 \/ 5\.0 h/)).toBeTruthy();
  });

  it('says under each written exam whether you can write it yet', async () => {
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Working on'), { target: { value: 'ifr3' } });
    expect(await screen.findByText('Can you write the INRAT yet? Not yet: 2 things left.')).toBeTruthy();
    const checks = screen.getByRole('list', { name: 'To write the INRAT' });
    expect(checks.textContent).toContain('Category 3 or 1 medical');
    expect(checks.textContent).toContain('5 h instrument flight or ground time');
    expect(checks.textContent).not.toContain('Letter of recommendation');
  });

  it('ticks off an exam with its mark', async () => {
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Working on'), { target: { value: 'ifr3' } });
    fireEvent.click(await screen.findByLabelText(/INRAT written exam/));
    fireEvent.change(await screen.findByLabelText('Mark %'), { target: { value: '65' } });
    expect(await screen.findByText(/Pass mark is 70%/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Mark %'), { target: { value: '84' } });
    await waitFor(() => expect(screen.queryByText(/Pass mark is 70%/)).toBeNull());
  });

  it('offers to create a profile once there is something to lose', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark PPL as held' }));
    expect(await screen.findByText(/only on this device/)).toBeTruthy();
  });
});

describe('opening the app', () => {
  it('recommends a profile on a first visit, at once and without waking the server', () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Create your free profile' })).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('wakes the server once the pilot starts on the form', () => {
    render(<App />);
    fireEvent.focusIn(screen.getByLabelText('Email'));
    fireEvent.focusIn(screen.getByLabelText('Password'));
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/health']);
  });

  it('goes on without a profile, and does not ask again', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue without a profile' }));
    expect(await screen.findByLabelText('Working on')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create profile' })).toBeTruthy();

    cleanup();
    render(<App />);
    expect(screen.getByLabelText('Working on')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Create your free profile' })).toBeNull();
  });

  it('opens the logbook in the new profile after signing up from the welcome', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === '/api/auth/signup') return { ok: true, status: 200, json: async () => ({ user: { email: 'student@example.com' } }) } as Response;
      if (url === '/api/logbook') return { ok: true, status: 200, json: async () => emptyLogbook() } as Response;
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as Response;
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'student@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
    expect(await screen.findByText('Saved to your profile')).toBeTruthy();
  });

  it('switches the welcome to signing in', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('goes straight to the logbook a guest already has on this device', () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: { ...emptyLogbook().profile, medical: 'cat3' } });
    render(<App />);
    expect(screen.getByLabelText('Working on')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Create your free profile' })).toBeNull();
  });

  it('says why when the server is slow to answer', async () => {
    rememberSignedIn(true);
    vi.useFakeTimers();
    try {
      // A server that is still waking up: the first call does not come back.
      vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
      render(<App />);
      expect(screen.getByRole('status').textContent).toContain('Loading your logbook');
      expect(screen.queryByText(/takes up to a minute/)).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(4000));
      expect(screen.getByText(/takes up to a minute to wake up/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a forgotten password', () => {
  const answer = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;

  it('asks for a reset link from the sign-in form, without saying whether the profile exists', async () => {
    vi.mocked(fetch).mockImplementation(async (url) => (url === '/api/auth/forgot' ? answer(204, null) : answer(401, {})));
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sign in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }));
    expect(screen.getByRole('heading', { name: 'Forgot your password?' })).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();

    type('Email', 'student@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If there’s a profile for student@example\.com, a link/)).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/auth/forgot',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'student@example.com' }) }),
    );
  });

  it('opens the emailed link on a new password, and signs in with it', async () => {
    window.history.replaceState(null, '', '/#reset=tok-123');
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (url === '/api/auth/reset') return answer(200, { user: { email: 'student@example.com' } });
      if (url === '/api/logbook') return answer(200, emptyLogbook());
      return answer(200, { ok: true });
    });
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeTruthy();
    // The token is out of the address bar as soon as it has been read.
    await waitFor(() => expect(window.location.hash).toBe(''));

    type('New password', 'a new long password');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText('Saved to your profile')).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/auth/reset',
      expect.objectContaining({ body: JSON.stringify({ token: 'tok-123', password: 'a new long password' }) }),
    );
  });

  it('says when the link has expired, and goes back to the app', async () => {
    window.history.replaceState(null, '', '/#reset=old');
    vi.mocked(fetch).mockImplementation(async (url) =>
      url === '/api/auth/reset'
        ? answer(400, { error: 'This link has expired or has already been used. Ask for a new one.' })
        : answer(401, {}),
    );
    render(<App />);
    type('New password', 'a new long password');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByText(/This link has expired/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Hours to Go' }));
    expect(screen.getByRole('heading', { name: 'Create your free profile' })).toBeTruthy();
  });
});
