import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { emptyLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { drawCard, shareCard, wrapped, type CardFacts } from '../../src/ui/card';
import { line, profile } from './fixtures';

const facts: CardFacts = { headline: '58% of the way to my PPL', detail: '26.1 of 45.0 h', percent: 58 };
const drawn: string[] = [];

function stubCanvas() {
  drawn.length = 0;
  const context = new Proxy({} as Record<string, unknown>, {
    get: (target, key) => {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 40 });
      if (key === 'fillText') return (s: string) => drawn.push(s);
      if (key in target) return target[key as string];
      return () => undefined;
    },
    set: (target, key, value) => {
      target[key as string] = value;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((done) => done(new Blob(['png'], { type: 'image/png' })));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'canShare');
  Reflect.deleteProperty(navigator, 'share');
});

describe('wrapping the words', () => {
  const measure = (s: string) => s.length;

  it('fits as many on a line as it can', () => {
    expect(wrapped('one two three four', 9, measure)).toEqual(['one two', 'three', 'four']);
  });

  it('keeps a word longer than the line whole', () => {
    expect(wrapped('qualification de', 5, measure)).toEqual(['qualification', 'de']);
  });
});

describe('the picture', () => {
  beforeEach(stubCanvas);

  it('says the headline and the detail', async () => {
    await drawCard({ ...facts, headline: 'My first solo', percent: null });
    expect(drawn).toContain('My first solo');
    expect(drawn).toContain('26.1 of 45.0 h');
    expect(drawn).toContain('HOURS TO GO');
  });

  it('shows the percent only when there is one', async () => {
    await drawCard(facts);
    expect(drawn).toContain('58%');
    drawn.length = 0;
    await drawCard({ ...facts, percent: null });
    expect(drawn).not.toContain('58%');
  });

  it('goes to the share sheet where there is one', async () => {
    const share = vi.fn(async () => undefined);
    Object.assign(navigator, { canShare: () => true, share });
    await shareCard(facts);
    const [{ files }] = share.mock.calls[0] as unknown as [{ files: File[] }];
    expect(files[0]!.type).toBe('image/png');
    expect(files[0]!.name).toMatch(/^hours-to-go-.*\.png$/);
  });

  it('downloads where there isn’t', async () => {
    const createObjectURL = vi.fn(() => 'blob:card');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await shareCard(facts);
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  it('doesn’t treat closing the share sheet as a failure', async () => {
    Object.assign(navigator, { canShare: () => true, share: vi.fn(async () => Promise.reject(new DOMException('no', 'AbortError'))) });
    await expect(shareCard(facts)).resolves.toBeUndefined();
  });
});

describe('on the screen', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in to continue.' }) })));
    rememberWelcomed();
    stubCanvas();
  });

  const share = vi.fn(async () => undefined);
  const canShare = () => Object.assign(navigator, { canShare: () => true, share });
  const seed = (entries: ReturnType<typeof line>[], change = {}) => saveGuestLogbook({ ...emptyLogbook(), entries, profile: profile(change) });

  it('makes a card of how far along the goal is', async () => {
    canShare();
    seed([line('2026-10-01', { seDayDual: 9 })]);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share my progress' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(drawn).toContain('On the way to my PPL');
  });

  it('isn’t offered with nothing to show yet', async () => {
    seed([]);
    render(<App />);
    await screen.findByLabelText('Working on');
    expect(screen.queryByRole('button', { name: 'Share my progress' })).toBeNull();
  });

  it('celebrates a licence held', async () => {
    canShare();
    seed([], { held: { ppl: { date: '2026-03-01' } } });
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share my progress' }));
    await waitFor(() => expect(drawn).toContain('I earned my PPL'));
  });

  it('offers a card for a first solo, right after logging it', async () => {
    canShare();
    seed([line('2026-10-01', { seDayDual: 12 })]);
    render(<App />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Log a flight' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Solo'));
    fireEvent.change(within(dialog).getByLabelText('Flight time, in hours'), { target: { value: '0.5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(document.querySelector('.toast')).not.toBeNull());
    fireEvent.click(within(document.querySelector('.toast') as HTMLElement).getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(drawn).toContain('My first solo'));
  });

  it('leaves an ordinary flight’s notice as it was', async () => {
    seed([line('2026-10-01', { seDayDual: 12 }), line('2026-10-02', { seDayPic: 1 }, { solo: true })]);
    render(<App />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Log a flight' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Dual, with an instructor'));
    fireEvent.change(within(dialog).getByLabelText('Flight time, in hours'), { target: { value: '1.0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(document.querySelector('.toast')).not.toBeNull());
    expect(within(document.querySelector('.toast') as HTMLElement).queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('says so if the picture can’t be made', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    seed([line('2026-10-01', { seDayDual: 9 })]);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Share my progress' }));
    expect(await screen.findByText('Couldn’t make the picture.')).toBeTruthy();
  });
});
