import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { parseCsv, readCsv, summarize, toCsv, type CsvRead } from '../../src/model/csv';
import { emptyLogbook, loadGuestLogbook, rememberWelcomed, saveGuestLogbook } from '../../src/model/store';
import { line, totals } from './fixtures';

const read = (text: string) => readCsv(text) as CsvRead;
const HEAD = 'Date,SE day PIC,Remarks';

describe('writing a spreadsheet', () => {
  it('has one row a line, oldest first, in hours', () => {
    const csv = toCsv([line('2026-10-02', { seDayPic: 1.5 }), line('2026-10-01', { seDayDual: 1 + 1 / 3 })]);
    const [header, first, second] = parseCsv(csv);
    expect(header![0]).toBe('Date');
    expect(header).toContain('Single-engine day PIC');
    expect(first![0]).toBe('2026-10-01');
    expect(first![header!.indexOf('Single-engine day Dual')]).toBe('1.33');
    expect(second![header!.indexOf('Single-engine day PIC')]).toBe('1.5');
  });

  it('starts with a byte-order mark, so Excel reads accents', () => {
    expect(toCsv([]).charCodeAt(0)).toBe(0xfeff);
  });

  it('can’t be made to run a formula when opened', () => {
    const csv = toCsv([line('2026-10-01', { seDayPic: 1 }, { remarks: '=HYPERLINK("http://x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
  });
});

describe('reading it back', () => {
  it('comes back the same, however awkward the text', () => {
    const entries = [
      line('2026-10-01', { seDayPic: 1 + 1 / 3, xcDayPic: 1 }, { aircraft: 'C172', registration: 'C-GABC', from: 'CYTZ', to: 'CYKZ', dayLandings: 3, solo: true, remarks: 'Vent, “gusty”\nÉtude, 50% = ok' }),
      line('2026-10-02', { meNightCopilot: 2, hood: 0.5 }, { nightLandings: 1, approaches: 2, remarks: '-flagged' }),
      line('2026-10-03', { ftd: 1.5 }, { aircraft: 'Redbird', approaches: 4 }),
    ];
    const back = read(toCsv(entries));
    expect(back.problems).toEqual([]);
    expect(back.unused).toEqual([]);
    expect(back.entries).toEqual(entries);
  });

  it('brings paper totals back as paper totals, with their questions open', () => {
    const [e] = read(toCsv([totals('2026-01-01', { seDayPic: 100 }, { solo: 'all' })])).entries;
    expect(e).toMatchObject({ forward: true, seDayPic: 6000, solo: false });
    expect(e!.breakdown).toMatchObject({ solo: null });
  });

  it('reads what Excel in French Canada saves', () => {
    const { entries } = read('﻿Date;SE day PIC;Remarks\r\n2026-10-01;1,5;Vol local\r\n');
    expect(entries).toMatchObject([{ date: '2026-10-01', seDayPic: 90, remarks: 'Vol local' }]);
  });

  it('reads h:mm as well as hours', () => {
    expect(read(`${HEAD}\n2026-10-01,1:30,\n`).entries[0]!.seDayPic).toBe(90);
    expect(read(`${HEAD}\n2026-10-01,1:30:00,\n`).entries[0]!.seDayPic).toBe(90);
  });

  it('knows the short headings a pilot would use', () => {
    const { entries, unused } = read('Date,Type,Reg,SE Day Dual,XC Day Dual,ME Night PIC,Hood,Day Landings,Notes\n2026-10-01,C172,C-GABC,2,1,0.5,0.2,4,Hi\n');
    expect(unused).toEqual([]);
    expect(entries[0]).toMatchObject({ aircraft: 'C172', registration: 'C-GABC', seDayDual: 120, xcDayDual: 60, meNightPic: 30, hood: 12, dayLandings: 4, remarks: 'Hi' });
  });

  it('won’t guess what a bare heading means', () => {
    expect(readCsv('Date,Dual,PIC,Total\n2026-10-01,1,1,2\n')).toContain('headings');
    const { entries, unused } = read('Date,SE day PIC,Dual,Total\n2026-10-01,1,1,2\n');
    expect(unused).toEqual(['Dual', 'Total']);
    expect(entries[0]).toMatchObject({ seDayPic: 60, seDayDual: 0 });
  });

  it('turns down a file that isn’t a logbook', () => {
    expect(typeof readCsv('hello there\nsome words\n')).toBe('string');
    expect(typeof readCsv('')).toBe('string');
  });

  it('skips empty rows, and says which row had which problem', () => {
    const { entries, problems } = read(`${HEAD}\n2026-10-01,1,\n,,\n10/20/2026,1,\n2026-02-30,1,\nTOTAL,2,\n2026-10-02,abc,\n2026-10-03,,\n`);
    expect(entries).toHaveLength(1);
    expect(problems).toMatchObject([
      { row: 4, why: expect.stringContaining('10/20/2026') },
      { row: 5, why: expect.stringContaining('2026-02-30') },
      { row: 6, why: expect.stringContaining('TOTAL') },
      { row: 7, why: expect.stringContaining('“abc” under SE day PIC') },
      { row: 8, why: expect.stringContaining('flight-time') },
    ]);
  });

  it('holds a row to the same rules as the form', () => {
    expect(read('Date,SE day Dual,Solo\n2026-10-01,1,yes\n').problems[0]!.why).toContain('Solo needs PIC');
  });

  describe('without an Id column', () => {
    const file = `${HEAD}\n2026-10-01,1,Circuit\n2026-10-01,1,Circuit\n2026-10-02,1,\n`;

    it('keeps two identical lines as two', () => {
      expect(new Set(read(file).entries.map((e) => e.id)).size).toBe(3);
    });

    it('gets the same ids each time, so importing twice doesn’t double it', () => {
      const first = read(file);
      expect(read(file).entries.map((e) => e.id)).toEqual(first.entries.map((e) => e.id));
      expect(summarize(read(file), first.entries, '2026-11-08')).toMatchObject({ already: 3, fresh: [] });
    });
  });

  it('sums up what would be added', () => {
    const s = summarize(read(`${HEAD}\n2026-10-05,1.5,\n2026-09-01,9,\n2026-10-01,1,\n`), [], '2026-11-08');
    expect(s).toMatchObject({ already: 0, minutes: 690, first: '2026-09-01', last: '2026-10-05', doubts: 1 });
  });
});

describe('on the Profile tab', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in to continue.' }) })));
    rememberWelcomed();
    saveGuestLogbook(emptyLogbook());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const choose = async (text: string, name = 'log.csv') => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Profile' }));
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = Object.assign(new File([text], name), { text: async () => text });
    fireEvent.change(input, { target: { files: [file] } });
  };

  it('shows what a file would add, and adds nothing until asked', async () => {
    await choose(`${HEAD}\n2026-10-01,1.5,\n2026-10-02,1,\n`);
    expect(await screen.findByText('2 lines to add')).toBeTruthy();
    expect(loadGuestLogbook().entries).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 lines' }));
    await waitFor(() => expect(loadGuestLogbook().entries).toHaveLength(2));
    expect(await screen.findByText(/Added 2 lines/)).toBeTruthy();
  });

  it('adds nothing when cancelled', async () => {
    await choose(`${HEAD}\n2026-10-01,1.5,\n`);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('1 line to add')).toBeNull();
    expect(loadGuestLogbook().entries).toEqual([]);
  });

  it('says why a file can’t be read', async () => {
    await choose('nothing useful here\n');
    expect(await screen.findByText(/headings don’t say/)).toBeTruthy();
  });

  it('still reads a logbook file', async () => {
    await choose(JSON.stringify({ version: 2, entries: [line('2026-10-01', { seDayPic: 1 })], profile: emptyLogbook().profile }), 'backup.json');
    await waitFor(() => expect(loadGuestLogbook().entries).toHaveLength(1));
  });
});
