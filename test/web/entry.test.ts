import { describe, expect, it } from 'vitest';
import { afterPplPart, derive, formatHours, formatHoursUp, parseDuration, validateEntry } from '../../src/model/entry';
import { mergeLogbooks, parseLogbook } from '../../src/model/store';
import { line, profile, totals } from './fixtures';

describe('parseDuration', () => {
  it('reads decimal hours and hours:minutes', () => {
    expect(parseDuration('1.3')).toBe(78);
    expect(parseDuration('1,3')).toBe(78);
    expect(parseDuration('.5')).toBe(30);
    expect(parseDuration('2')).toBe(120);
    expect(parseDuration('1:18')).toBe(78);
    expect(parseDuration('0:05')).toBe(5);
  });

  it('treats blank as zero and rejects anything else', () => {
    expect(parseDuration('  ')).toBe(0);
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('.')).toBeNull();
    expect(parseDuration('-1')).toBeNull();
  });
});

describe('formatting', () => {
  it('shows tenths, and never rounds a shortfall down to nothing', () => {
    expect(formatHours(78)).toBe('1.3');
    expect(formatHoursUp(1)).toBe('0.1');
    expect(formatHoursUp(60)).toBe('1.0');
  });
});

describe('a logbook line', () => {
  it('adds only the ten flight-time columns to the grand total', () => {
    const d = derive(
      line('2026-01-01', {
        seDayDual: 1,
        seNightPic: 0.5,
        meDayCopilot: 2,
        xcDayDual: 1,
        hood: 0.8,
        ftd: 1.5,
      }),
    );
    expect(d.total).toBe(3.5 * 60);
    expect(d.night).toBe(30);
    expect(d.multi).toBe(120);
  });

  it('counts instrument time as dual only up to the line’s dual time', () => {
    expect(derive(line('2026-01-01', { seDayDual: 1, hood: 0.8 })).dualInst).toBe(48);
    expect(derive(line('2026-01-01', { seDayPic: 1.5, hood: 1 })).dualInst).toBe(0);
  });

  it('counts every night landing as solo on a solo line with no night dual time', () => {
    expect(derive(line('2026-01-01', { seDayDual: 2, seNightPic: 1 }, { solo: true, nightLandings: 6 })).soloNightLandings).toBe(6);
  });

  it('counts only the stated solo night landings when the line also has night dual time', () => {
    const e = line('2026-01-01', { seNightDual: 5, seNightPic: 3.5 }, { solo: true, nightLandings: 34, soloNightLandings: 12 });
    expect(derive(e).soloNightLandings).toBe(12);
    expect(derive({ ...e, solo: false }).soloNightLandings).toBe(0);
  });

  it('counts PIC time as solo only on a line marked solo', () => {
    expect(derive(line('2026-01-01', { seNightPic: 1, xcNightPic: 1 }, { solo: true, nightLandings: 3 }))).toMatchObject({
      solo: 60,
      soloNight: 60,
      soloXc: 60,
      soloNightLandings: 3,
    });
    expect(derive(line('2026-01-01', { seDayPic: 1 })).solo).toBe(0);
  });
});

describe('paper totals and their questions', () => {
  const paper = { seDayDual: 40, seNightDual: 5, seDayPic: 30, seNightPic: 3.5, xcDayPic: 22 };

  it('counts all PIC as solo when the answer is “all of it”', () => {
    const d = derive(totals('2026-09-30', paper, { solo: 'all' }, { nightLandings: 34, soloNightLandings: 14 }));
    expect(d).toMatchObject({ solo: 33.5 * 60, soloNight: 210, soloXc: 22 * 60, soloNightLandings: 14 });
  });

  it('counts the stated parts when the answer is “some of it”, and nothing for “none”', () => {
    const some = derive(totals('2026-09-30', paper, { solo: 'some', soloDay: 10, soloNight: 1, soloXc: 5 }, { nightLandings: 34, soloNightLandings: 4 }));
    expect(some).toMatchObject({ solo: 11 * 60, soloNight: 60, soloXc: 5 * 60, soloNightLandings: 4 });
    expect(derive(totals('2026-09-30', paper, { solo: 'none' }, { nightLandings: 34 }))).toMatchObject({ solo: 0, soloNightLandings: 0 });
  });

  it('takes every night landing as solo when there is no night dual time', () => {
    const d = derive(totals('2026-09-30', { seDayDual: 40, seNightPic: 3 }, { solo: 'all' }, { nightLandings: 12 }));
    expect(d.soloNightLandings).toBe(12);
  });

  it('splits off the part flown after the PPL', () => {
    const t = totals('2026-09-30', paper, { solo: 'all', afterPpl: 'some', after: { dual: 10, dualNight: 2, dualInst: 6, solo: 3 } });
    expect(derive(afterPplPart(t, '2025-05-01')!)).toMatchObject({ dual: 600, dualNight: 120, dualInst: 360, solo: 180 });
    const answered = (afterPpl: 'none' | 'all') => ({ ...t, breakdown: { ...t.breakdown!, afterPpl } });
    expect(afterPplPart(answered('none'), '2025-05-01')).toBeNull();
    const whole = answered('all');
    expect(afterPplPart(whole, '2025-05-01')).toBe(whole);
    expect(afterPplPart(t, '2026-10-01')).toBeNull();
  });

  it('won’t take answers bigger than the totals', () => {
    const err = validateEntry(
      totals('2026-09-30', paper, { solo: 'some', soloNight: 4, afterPpl: 'some', after: { dual: 50, dualNightXc: 1, dualXc: 0 } }),
    );
    expect(err.soloNight).toBeDefined();
    expect(err['after.dual']).toBeDefined();
    expect(err['after.dualNightXc']).toBeDefined();
  });
});

describe('validateEntry', () => {
  it('rejects cross-country and instrument time bigger than the flight time they are part of', () => {
    const err = validateEntry(line('2026-01-01', { seDayDual: 1, seNightPic: 1, xcDayDual: 2, xcNightPic: 1.5, hood: 2.5 }));
    expect(err.xcDayDual).toBeDefined();
    expect(err.xcNightPic).toBeDefined();
    expect(err.hood).toBeDefined();
  });

  it('needs some time on the line', () => {
    expect(validateEntry(line('2026-01-01', {})).time).toBeDefined();
    expect(validateEntry(line('2026-01-01', { ftd: 1 }))).toEqual({});
  });

  it('lets Solo share a line with dual time, but needs PIC time to be solo', () => {
    expect(validateEntry(line('2026-01-01', { seDayDual: 1 }, { solo: true })).solo).toMatch(/needs PIC/);
    expect(validateEntry(line('2026-01-01', { seDayDual: 40, seDayPic: 30, seNightPic: 3.5 }, { solo: true }))).toEqual({});
  });

  it('won’t take more solo night landings than night landings', () => {
    const e = line('2026-01-01', { seNightDual: 5, seNightPic: 3.5 }, { solo: true, nightLandings: 34, soloNightLandings: 40 });
    expect(validateEntry(e).soloNightLandings).toBeDefined();
  });
});

describe('logbook files', () => {
  it('rejects things that are not a logbook and cleans what is', () => {
    expect(parseLogbook(null)).toBeNull();
    expect(parseLogbook({ version: 3, entries: [] })).toBeNull();
    const book = parseLogbook({
      version: 2,
      entries: [{ id: 'a', date: '2026-01-01', seDayDual: -5, seDayPic: 30, solo: 'yes' }, { date: 'not a date' }],
      profile: { medical: 'cat9', held: { ppl: { date: '2025-05-01' }, nonsense: {} } },
    });
    expect(book?.entries).toHaveLength(1);
    expect(book?.entries[0]).toMatchObject({ seDayDual: 0, seDayPic: 30, solo: false });
    expect(book?.profile.medical).toBe('none');
    expect(Object.keys(book?.profile.held ?? {})).toEqual(['ppl']);
  });

  it('moves lines saved by the first version into the paper-log columns', () => {
    const book = parseLogbook({
      version: 1,
      entries: [
        { id: 's', kind: 'flight', role: 'solo', date: '2026-01-01', total: 90, night: 30, xc: 60, xcNight: 30, route: 'CYSN-CYHM-CYKF', nightLandings: 2, remarks: 'nice' },
        { id: 'd', kind: 'flight', role: 'dual', multiEngine: true, date: '2026-01-02', total: 60, hood: 30 },
        { id: 'c', kind: 'flight', role: 'copilot', date: '2026-01-03', total: 120, night: 60, xc: 120 },
        { id: 'f', kind: 'sim', role: 'dual', date: '2026-01-04', total: 60, approaches: 3 },
      ],
      profile: {},
    });
    const [s, d, c, f] = book!.entries;
    expect(s).toMatchObject({ seDayPic: 60, seNightPic: 30, xcDayPic: 30, xcNightPic: 30, solo: true, nightLandings: 2, from: 'CYSN', to: 'CYKF', remarks: 'via CYHM. nice' });
    expect(d).toMatchObject({ meDayDual: 60, hood: 30, solo: false });
    expect(c).toMatchObject({ meDayCopilot: 60, meNightCopilot: 60, xcDayPic: 0, xcDayDual: 0 });
    expect(f).toMatchObject({ ftd: 60, approaches: 3 });
    expect(derive(f!).total).toBe(0);
  });

  it('merges without deleting, and the existing side wins', () => {
    const a = line('2026-01-01', { seDayDual: 1 }, { id: 'same', remarks: 'mine' });
    const b = line('2026-01-01', { seDayDual: 1 }, { id: 'same', remarks: 'theirs' });
    const c = line('2026-01-02', { seDayPic: 1 }, { id: 'new' });
    const merged = mergeLogbooks(
      { version: 2, entries: [a], profile: profile({ medical: 'cat1', focus: 'cpl' }) },
      { version: 2, entries: [b, c], profile: profile({ medical: 'cat3', focus: 'ifr3', held: { ppl: { date: '' } } }) },
    );
    expect(merged.entries.map((e) => e.remarks)).toEqual(['mine', '']);
    expect(merged.profile.medical).toBe('cat1');
    expect(merged.profile.focus).toBe('cpl');
    expect(merged.profile.held.ppl).toBeDefined();
  });

  it('keeps the guest focus when moving into an empty account', () => {
    const merged = mergeLogbooks(
      { version: 2, entries: [], profile: profile() },
      { version: 2, entries: [line('2026-01-01', { seDayDual: 1 })], profile: profile({ focus: 'ifr3' }) },
    );
    expect(merged.profile.focus).toBe('ifr3');
  });
});
