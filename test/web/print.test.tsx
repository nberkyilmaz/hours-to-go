import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import type { Entry } from '../../src/model/entry';
import { inLogOrder, printPages, remarksCut, remarksOf, withLongRemarks, REMARKS_SHOWN, ROWS_PER_PAGE } from '../../src/model/printlog';
import { emptyLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { line, totals } from './fixtures';

const flights = (n: number) => Array.from({ length: n }, (_, i) => line(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, { seDayPic: 1 }, { id: `f${i}`, dayLandings: 2 }));

describe('the pages', () => {
  it('has none for an empty logbook', () => {
    expect(printPages([])).toEqual([]);
  });

  it('fills each page, and starts another only when it has to', () => {
    expect(printPages(flights(ROWS_PER_PAGE)).map((p) => p.rows.length)).toEqual([ROWS_PER_PAGE]);
    expect(printPages(flights(ROWS_PER_PAGE + 1)).map((p) => p.rows.length)).toEqual([ROWS_PER_PAGE, 1]);
  });

  it('adds up like a paper log, each page carrying on from the last', () => {
    const pages = printPages(flights(5), 2);
    expect(pages.map((p) => p.page.seDayPic)).toEqual([120, 120, 60]);
    expect(pages.map((p) => p.forward.seDayPic)).toEqual([0, 120, 240]);
    expect(pages.map((p) => p.toDate.seDayPic)).toEqual([120, 240, 300]);
    expect(pages.at(-1)!.toDate.dayLandings).toBe(10);
  });

  it('counts paper totals in with the rest', () => {
    const [page] = printPages([totals('2025-12-31', { seDayPic: 50 }, { solo: 'all' }), line('2026-01-01', { seDayPic: 1 })]);
    expect(page!.toDate.seDayPic).toBe(51 * 60);
  });

  it('runs oldest first, with paper totals ahead of a flight on the same day', () => {
    const flight = line('2026-01-01', { seDayPic: 1 }, { id: 'flight' });
    const paper = totals('2026-01-01', { seDayPic: 9 }, {}, { id: 'paper' });
    const earlier = line('2025-06-01', { seDayPic: 1 }, { id: 'earlier' });
    expect(inLogOrder([flight, paper, earlier]).map((e) => e.id)).toEqual(['earlier', 'paper', 'flight']);
  });
});

describe('the remarks', () => {
  const long = 'x'.repeat(REMARKS_SHOWN + 5);

  it('says what the columns can’t: solo, and paper totals', () => {
    expect(remarksOf(line('2026-01-01', { seDayPic: 1 }, { solo: true, remarks: 'Circuits' }))).toBe('Solo · Circuits');
    expect(remarksOf(totals('2026-01-01', { seDayPic: 1 }))).toBe('Brought forward');
  });

  it('keeps a row to one line', () => {
    expect(remarksOf(line('2026-01-01', { seDayPic: 1 }, { remarks: 'Two\nlines' }))).toBe('Two lines');
  });

  it('cuts a long remark short on the row, and keeps it whole for the last page', () => {
    const e = line('2026-01-01', { seDayPic: 1 }, { remarks: long });
    expect(remarksCut(e).length).toBeLessThanOrEqual(REMARKS_SHOWN);
    expect(remarksCut(e).endsWith('…')).toBe(true);
    expect(withLongRemarks([e, line('2026-01-02', { seDayPic: 1 }, { remarks: 'Short' })])).toEqual([e]);
  });

  it('leaves one that just fits alone', () => {
    const e = line('2026-01-01', { seDayPic: 1 }, { remarks: 'y'.repeat(REMARKS_SHOWN) });
    expect(remarksCut(e)).toBe(e.remarks);
    expect(withLongRemarks([e])).toEqual([]);
  });
});

describe('the screen', () => {
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
  const seed = (entries: Entry[]) => saveGuestLogbook({ ...emptyLogbook(), entries });

  const open = async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Logbook' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Print or save as PDF' }));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return screen.findByRole('heading', { name: 'Print your logbook' });
  };

  it('opens from the Logbook, and comes back', async () => {
    seed(flights(3));
    await open();
    const page = screen.getByRole('region', { name: 'Page 1 of 1' });
    expect(within(page).getAllByRole('row').length).toBeGreaterThan(3);
    expect(within(page).getByRole('rowheader', { name: 'Total to date' })).toBeTruthy();
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('button', { name: 'Logbook' })).toBeTruthy();
  });

  it('prints the name given, on every page', async () => {
    seed(flights(ROWS_PER_PAGE + 1));
    await open();
    fireEvent.change(screen.getByLabelText('Name on the pages'), { target: { value: 'A. Pilot' } });
    expect(screen.getAllByText('A. Pilot')).toHaveLength(2);
  });

  it('hands over to the browser to print', async () => {
    seed(flights(1));
    await open();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    window.print = print;
    fireEvent.click(screen.getByRole('button', { name: 'Print or save as PDF' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('adds a page for remarks too long for a row', async () => {
    seed([line('2026-01-01', { seDayPic: 1 }, { remarks: 'z'.repeat(REMARKS_SHOWN + 10) })]);
    await open();
    expect(within(screen.getByRole('region', { name: 'Remarks in full' })).getByText('z'.repeat(REMARKS_SHOWN + 10))).toBeTruthy();
  });
});
