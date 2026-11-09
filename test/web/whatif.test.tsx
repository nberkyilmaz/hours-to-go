import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { addDays, today, type Entry } from '../../src/model/entry';
import { emptyLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { monthsBetween } from '../../src/rules/pace';
import { line } from './fixtures';

describe('months between two finishes', () => {
  it('rounds to whole months, and is negative when sooner', () => {
    expect(monthsBetween('2027-01-01', '2027-04-01')).toBe(3);
    expect(monthsBetween('2027-04-01', '2027-01-01')).toBe(-3);
    expect(monthsBetween('2027-01-01', '2027-01-10')).toBe(0);
  });
});

describe('the slider', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in to continue.' }) })));
    rememberWelcomed();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  // Two flights a week, 1.5 h each, from before the eight weeks measured: 3 h a week.
  const steady = (): Entry[] => Array.from({ length: 20 }, (_, i) => line(addDays(today(), -Math.round(3.5 * i) - 1), { seDayDual: 1.5 }, { id: `f${i}` }));
  const open = async (entries: Entry[]) => {
    saveGuestLogbook({ ...emptyLogbook(), entries });
    render(<App />);
    const box = (await screen.findByText('What if you flew more or less?')).closest('details') as HTMLDetailsElement;
    return { box, slider: within(box).getByRole('slider') as HTMLInputElement };
  };
  const set = (slider: HTMLInputElement, hours: number) => fireEvent.change(slider, { target: { value: String(hours) } });

  it('starts at the pilot’s own pace, the same as the finish date above it', async () => {
    const { box, slider } = await open(steady());
    expect(slider.value).toBe('3');
    expect(box.textContent).toContain('3 h a week');
    expect(box.textContent).toContain('About the same as your pace.');
  });

  it('moves the date and says how much sooner or later', async () => {
    const { box, slider } = await open(steady());
    set(slider, 6);
    expect(box.textContent).toContain('6 h a week');
    expect(box.textContent).toMatch(/\d+ months? sooner than your pace/);
    set(slider, 1);
    expect(box.textContent).toMatch(/\d+ months? later than your pace/);
  });

  it('says what that pace costs a month, more when flying more', async () => {
    const { box, slider } = await open(steady());
    const price = () => Number(/about \$([\d,]+) a month/.exec(box.textContent!)![1]!.replace(',', ''));
    set(slider, 2);
    const slow = price();
    set(slider, 8);
    expect(price()).toBeGreaterThan(slow);
  });

  it('is there for a new student too, with no pace to compare', async () => {
    const { box, slider } = await open([]);
    expect(slider.value).toBe('2');
    expect(box.textContent).toContain('Around');
    expect(box.textContent).not.toContain('than your pace');
  });

  it('tells a screen reader the pace in words', async () => {
    const { slider } = await open(steady());
    set(slider, 4.5);
    expect(slider.getAttribute('aria-valuetext')).toBe('4.5 h a week');
  });

  it('saves nothing', async () => {
    const entries = steady();
    const { slider } = await open(entries);
    const before = localStorage.getItem('hours-to-go/v1');
    set(slider, 10);
    expect(localStorage.getItem('hours-to-go/v1')).toBe(before);
  });
});
