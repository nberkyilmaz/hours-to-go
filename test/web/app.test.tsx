import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { rememberSignedIn } from '../../src/model/store';

// No server in these tests: every call answers "not signed in", so the app runs as a guest.
beforeEach(() => {
  localStorage.clear();
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
  it('opens at once on a browser that has never signed in, without waking the server', () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('Saved on this device only')).toBeTruthy();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
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
