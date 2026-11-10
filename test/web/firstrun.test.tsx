import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { emptyLogbook, loadGuestLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { line } from './fixtures';

const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const user = { email: 'student@example.com', confirmed: true, pendingEmail: null, reminders: false };

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', vi.fn(async () => reply(401, { error: 'Sign in to continue.' })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('an empty logbook', () => {
  beforeEach(() => rememberWelcomed());

  it('asks once where the pilot is, and a beginner can say so', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'I’m just starting' }));
    expect(screen.queryByRole('button', { name: /Add my hours/ })).toBeNull();
    cleanup();
    render(<App />);
    await screen.findByLabelText('Working on');
    expect(screen.queryByRole('button', { name: /Add my hours/ })).toBeNull();
  });

  it('takes the licences held, and moves on to the first one not held', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'I already hold a licence' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Private Pilot Licence — Aeroplane' }));
    expect(loadGuestLogbook().profile.held.ppl).toEqual({ date: '' });
    expect(loadGuestLogbook().profile.focus).toBe('night');
    expect(((await screen.findByLabelText('Working on')) as HTMLSelectElement).value).toBe('night');
  });
});

describe('getting set up', () => {
  beforeEach(() => rememberWelcomed());

  it('tells a beginner how to log the first lesson', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'I’m just starting' }));
    expect(await screen.findByText('After your first lesson, tap + to log it.')).toBeTruthy();
  });

  it('asks a licensed pilot when they got the PPL, and keeps the way to add hours', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'I already hold a licence' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Private Pilot Licence — Aeroplane' }));
    fireEvent.change(await screen.findByLabelText('When did you get your PPL?'), { target: { value: '2024-05-01' } });
    expect(loadGuestLogbook().profile.held.ppl).toEqual({ date: '2024-05-01' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('button', { name: /Add my hours/ })).toBeTruthy();
  });

  it('doesn’t raise alarms about currency before a flight is logged', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: { ...emptyLogbook().profile, held: { ppl: { date: '2024-05-01' } }, focus: 'night' } });
    render(<App />);
    const card = (await screen.findByText('Current to fly')).closest('details') as HTMLDetailsElement;
    expect(card.open).toBe(false);
    expect(card.textContent).toContain('log a flight to check');
  });

  it('asks for the PPL date where a CPL needs it', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: { ...emptyLogbook().profile, held: { ppl: { date: '' } }, focus: 'cpl' } });
    render(<App />);
    fireEvent.change(await screen.findByLabelText('When did you get your PPL?'), { target: { value: '2024-05-01' } });
    await waitFor(() => expect(loadGuestLogbook().profile.held.ppl).toEqual({ date: '2024-05-01' }));
    expect(screen.queryByLabelText('When did you get your PPL?')).toBeNull();
  });

  describe('after paper totals', () => {
    const paper = () => saveGuestLogbook({ ...emptyLogbook(), entries: [line('2026-10-01', { seDayDual: 18 }, { forward: true })] });
    const card = () => screen.findByRole('heading', { name: 'A few things your hours can’t show' });

    it('asks what the hours can’t show, once, in one place', async () => {
      paper();
      render(<App />);
      const section = (await card()).closest('section') as HTMLElement;
      expect(within(section).getByLabelText('40 h private pilot ground school')).toBeTruthy();
      expect(screen.getAllByLabelText('40 h private pilot ground school')).toHaveLength(1);
    });

    it('keeps a row where it is while it’s being answered, then forgets it next time', async () => {
      paper();
      render(<App />);
      const section = (await card()).closest('section') as HTMLElement;
      fireEvent.click(within(section).getByLabelText('40 h private pilot ground school'));
      expect(within(section).getByLabelText('40 h private pilot ground school')).toBeTruthy();
      cleanup();
      render(<App />);
      const again = (await card()).closest('section') as HTMLElement;
      expect(within(again).queryByLabelText('40 h private pilot ground school')).toBeNull();
    });

    it('can be put off', async () => {
      paper();
      render(<App />);
      const section = (await card()).closest('section') as HTMLElement;
      fireEvent.click(within(section).getByRole('button', { name: 'Later' }));
      expect(screen.queryByRole('heading', { name: 'A few things your hours can’t show' })).toBeNull();
      cleanup();
      render(<App />);
      await screen.findByLabelText('Working on');
      expect(screen.queryByRole('heading', { name: 'A few things your hours can’t show' })).toBeNull();
    });

    it('isn’t asked of a student logging flight by flight', async () => {
      saveGuestLogbook({ ...emptyLogbook(), entries: [line('2026-10-01', { seDayDual: 1 })] });
      render(<App />);
      await screen.findByLabelText('Working on');
      expect(screen.queryByRole('heading', { name: 'A few things your hours can’t show' })).toBeNull();
    });
  });
});

describe('trust', () => {
  beforeEach(() => rememberWelcomed());

  it('says how current the rules are, by the rules', async () => {
    render(<App />);
    expect(await screen.findByText(/current to NSA 2025-008, checked nightly/)).toBeTruthy();
  });

  it('marks this app’s own readings of the standard', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: { ...emptyLogbook().profile, focus: 'cpl' } });
    render(<App />);
    expect((await screen.findAllByText('Our reading. Ask your school.')).length).toBeGreaterThan(0);
  });

  it('asks for the mark, so a tick alone isn’t taken for a pass', async () => {
    saveGuestLogbook({ ...emptyLogbook(), profile: { ...emptyLogbook().profile, milestones: { 'exam-ppaer': { date: '2026-10-01' } } } });
    render(<App />);
    expect(await screen.findByText('Enter your overall mark so the app can check it.')).toBeTruthy();
  });

  it('explains the paper columns', async () => {
    saveGuestLogbook({ ...emptyLogbook(), entries: [line('2026-10-01', { seDayDual: 1 })] });
    render(<App />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Log a flight/ }))[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Paper columns' }));
    const glossary = screen.getByText('What the columns mean').closest('details') as HTMLElement;
    expect(within(glossary).getByText(/Pilot-in-command/)).toBeTruthy();
  });
});

describe('the sign-up form', () => {
  const email = (value: string) => fireEvent.change(screen.getByLabelText('Email'), { target: { value } });
  const password = (value: string) => fireEvent.change(screen.getByLabelText('Password'), { target: { value } });
  const submit = () => fireEvent.click(document.querySelector('form.auth button[type=submit]') as HTMLElement);

  it('says what’s wrong in its own words', async () => {
    render(<App />);
    await screen.findByLabelText('Email');
    email('not-an-email');
    submit();
    expect(await screen.findByText('Enter your email address, like you@example.com.')).toBeTruthy();
    email('student@example.com');
    password('short');
    submit();
    expect(await screen.findByText('Use at least 8 characters for your password.')).toBeTruthy();
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith('/api/auth/signup', expect.anything());
  });

  it('can show the password', async () => {
    render(<App />);
    const box = (await screen.findByLabelText('Password')) as HTMLInputElement;
    expect(box.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(box.type).toBe('text');
  });

  it('says how many entries moved into the new profile', async () => {
    rememberWelcomed();
    saveGuestLogbook({ ...emptyLogbook(), entries: [line('2026-10-01', { seDayDual: 1 }), line('2026-10-02', { seDayDual: 1 })] });
    vi.mocked(fetch).mockImplementation((async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/signup') return reply(200, { user });
      if (url === '/api/logbook/merge') return reply(200, JSON.parse(String(init?.body)));
      return reply(401, { error: 'Sign in to continue.' });
    }) as never);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Profile/ }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    submit();
    expect(await screen.findByText('All 2 entries from this device are in your new profile.')).toBeTruthy();
  });
});

describe('deleting a profile', () => {
  it('says it’s done', async () => {
    localStorage.setItem('hours-to-go/signed-in', '1');
    vi.mocked(fetch).mockImplementation((async (url: string, init?: RequestInit) => {
      if (url === '/api/me') return reply(200, { user });
      if (url === '/api/logbook') return reply(200, emptyLogbook());
      if (url === '/api/account' && init?.method === 'DELETE') return reply(204, null);
      return reply(200, {});
    }) as never);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^Profile/ }));
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByRole('button', { name: 'Export a copy of your logbook first' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.submit(document.querySelector('form.danger-zone') as HTMLElement);
    await waitFor(() => expect(screen.getByText('Your profile is deleted, along with every entry in it.')).toBeTruthy());
  });
});
