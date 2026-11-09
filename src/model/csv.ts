/**
 * The logbook as a spreadsheet (D54). The JSON file stays the full backup: this one is for opening in Excel, and for
 * bringing in a pilot's own spreadsheet. A column is only read if its heading says exactly which logbook column it
 * is, because guessing that "Dual" means single-engine day would count hours toward the wrong requirement.
 */
import {
  COLUMN_LABEL,
  COUNT_COLUMNS,
  LOG_GROUPS,
  TIME_COLUMNS,
  blankEntry,
  derive,
  doubtsAbout,
  isTimeColumn,
  validateEntry,
  type Column,
  type Entry,
} from './entry';

type Field = Column | 'date' | 'aircraft' | 'registration' | 'from' | 'to' | 'solo' | 'soloNightLandings' | 'forward' | 'remarks' | 'id';

const COLUMNS = LOG_GROUPS.flatMap((g) => g.columns.map((column) => ({ column, heading: `${g.title} ${COLUMN_LABEL[column]}` })));

const HEADINGS: readonly [string, Field][] = [
  ['Date', 'date'],
  ['Aircraft', 'aircraft'],
  ['Registration', 'registration'],
  ['From', 'from'],
  ['To', 'to'],
  ...COLUMNS.map((c): [string, Field] => [c.heading, c.column]),
  ['Solo', 'solo'],
  ['Solo night landings', 'soloNightLandings'],
  ['Paper totals', 'forward'],
  ['Remarks', 'remarks'],
  ['Id', 'id'],
];

const headingKey = (h: string) => h.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

/** Every heading that can only mean one column. Deliberately no bare "Dual", "PIC" or "Night". */
const FIELD_OF: ReadonlyMap<string, Field> = (() => {
  const map = new Map<string, Field>();
  for (const [heading, field] of HEADINGS) {
    map.set(headingKey(heading), field);
    map.set(headingKey(heading.replace('Single-engine', 'SE').replace('Multi-engine', 'ME').replace('Cross-country', 'XC')), field);
  }
  const also: Record<string, Field> = {
    type: 'aircraft',
    aircrafttype: 'aircraft',
    reg: 'registration',
    ident: 'registration',
    departure: 'from',
    dep: 'from',
    arrival: 'to',
    arr: 'to',
    destination: 'to',
    notes: 'remarks',
    comments: 'remarks',
    actualimc: 'actualImc',
    hood: 'hood',
    ftd: 'ftd',
    approaches: 'approaches',
    ifrapproaches: 'approaches',
    daylandings: 'dayLandings',
    nightlandings: 'nightLandings',
  };
  for (const [key, field] of Object.entries(also)) map.set(key, field);
  return map;
})();

// ---- Writing ----

/** Text a spreadsheet would run as a formula gets a leading apostrophe, taken off again when it's read back. */
const guarded = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const unguarded = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);
const quoted = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
/** Two places is close enough to come back to the same whole minute. Empty for none, like a paper log. */
const hoursText = (minutes: number) => (minutes ? String(Number((minutes / 60).toFixed(2))) : '');

function cellsOf(e: Entry): string[] {
  return [
    e.date,
    guarded(e.aircraft),
    guarded(e.registration),
    guarded(e.from),
    guarded(e.to),
    ...COLUMNS.map(({ column }) => (isTimeColumn(column) ? hoursText(e[column]) : e[column] ? String(e[column]) : '')),
    e.solo ? 'yes' : '',
    e.soloNightLandings ? String(e.soloNightLandings) : '',
    e.forward ? 'yes' : '',
    guarded(e.remarks),
    e.id,
  ];
}

/** Oldest first, like a paper log. With a byte-order mark, or Excel misreads accents. */
export function toCsv(entries: readonly Entry[]): string {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const rows = [HEADINGS.map(([h]) => h), ...sorted.map(cellsOf)];
  return `﻿${rows.map((r) => r.map(quoted).join(',')).join('\r\n')}\r\n`;
}

// ---- Reading ----

/** RFC 4180, and whichever separator the heading row uses: Excel in French Canada saves with semicolons. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const separator = [',', ';', '\t'].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else inQuotes = false;
    } else if (c === '"') inQuotes = true;
    else if (c === separator) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** A whole number of minutes from "1.5", "1,5" or "1:30". Null if it's neither. */
function minutesFrom(text: string): number | null {
  if (text === '') return 0;
  const clock = /^(\d+):([0-5]\d)(?::[0-5]\d)?$/.exec(text);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const decimal = text.replace(',', '.');
  return /^\d*\.?\d+$/.test(decimal) ? Math.round(Number(decimal) * 60) : null;
}

const countFrom = (text: string): number | null => (text === '' ? 0 : /^\d+$/.test(text) ? Number(text) : null);
const isYes = (text: string) => /^(yes|y|true|x|1|oui)$/i.test(text);

/** Year first only: 03/04/2026 could be March or April, and either guess would look right. */
function dateFrom(text: string): string | null {
  const found = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (!found) return null;
  const iso = `${found[1]}-${found[2]!.padStart(2, '0')}-${found[3]!.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/** 53 bits, so two different lines won't share an id. */
function hashOf(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}

export interface CsvRead {
  entries: Entry[];
  /** Rows left out, numbered as a spreadsheet numbers them. */
  problems: { row: number; why: string }[];
  /** Headings that aren't used, so the pilot can see what was left behind. */
  unused: string[];
}

/** What's in the file, or a sentence saying why nothing could be read. */
export function readCsv(text: string): CsvRead | string {
  const [header, ...rows] = parseCsv(text);
  const column = new Map<Field, number>();
  const unused: string[] = [];
  (header ?? []).forEach((heading, i) => {
    const field = FIELD_OF.get(headingKey(heading));
    if (field && !column.has(field)) column.set(field, i);
    else if (heading.trim() !== '') unused.push(heading.trim());
  });
  const hasTime = TIME_COLUMNS.some((c) => column.has(c));
  if (!column.has('date') || !hasTime) {
    return 'The headings don’t say which logbook columns these are, so nothing was read. Export a spreadsheet from here to see the headings to use.';
  }

  const headingOf = (f: Field) => header![column.get(f)!]!.trim();
  const entries: Entry[] = [];
  const problems: CsvRead['problems'] = [];
  const usedIds = new Set<string>();
  const sameLine = new Map<string, number>();

  rows.forEach((row, i) => {
    if (row.every((c) => c.trim() === '')) return;
    const number = i + 2;
    const get = (f: Field) => (column.has(f) ? (row[column.get(f)!] ?? '').trim() : '');
    const date = dateFrom(get('date'));
    if (!date) {
      problems.push({ row: number, why: get('date') ? `Couldn’t read the date “${get('date')}”. Use the form 2026-10-20.` : 'There’s no date.' });
      return;
    }
    const e = blankEntry(isYes(get('forward')), date);
    for (const c of [...TIME_COLUMNS, ...COUNT_COLUMNS]) {
      const value = isTimeColumn(c) ? minutesFrom(get(c)) : countFrom(get(c));
      if (value === null) {
        problems.push({ row: number, why: `“${get(c)}” under ${headingOf(c)} isn’t a ${isTimeColumn(c) ? 'time. Use hours, like 1.5 or 1:30' : 'whole number'}.` });
        return;
      }
      e[c] = value;
    }
    e.aircraft = unguarded(get('aircraft')).slice(0, 200);
    e.registration = unguarded(get('registration')).slice(0, 200);
    e.from = unguarded(get('from')).slice(0, 200);
    e.to = unguarded(get('to')).slice(0, 200);
    e.remarks = unguarded(get('remarks')).slice(0, 2000);
    e.solo = !e.forward && isYes(get('solo'));
    e.soloNightLandings = countFrom(get('soloNightLandings')) ?? 0;
    const wrong = Object.values(validateEntry(e))[0];
    if (wrong) {
      problems.push({ row: number, why: wrong });
      return;
    }
    const given = get('id');
    if (/^[\w-]{1,64}$/.test(given) && !usedIds.has(given)) e.id = given;
    else {
      // The same id from the same line, so importing a file twice doesn't double it. Two identical lines stay two.
      const base = `csv-${hashOf(row.filter((_, n) => n !== column.get('id')).join('\u0001'))}`;
      const seen = (sameLine.get(base) ?? 0) + 1;
      sameLine.set(base, seen);
      e.id = seen > 1 ? `${base}-${seen}` : base;
    }
    usedIds.add(e.id);
    entries.push(e);
  });
  return { entries, problems, unused };
}

export interface CsvSummary {
  fresh: Entry[];
  already: number;
  /** Flight time on the new lines. */
  minutes: number;
  first: string | null;
  last: string | null;
  /** New lines worth a second look: over 8 hours, or a future date. */
  doubts: number;
}

/** What adding this file would do, so a wrong unit shows before it's in the logbook. */
export function summarize(read: CsvRead, existing: readonly Entry[], today: string): CsvSummary {
  const ids = new Set(existing.map((e) => e.id));
  const fresh = read.entries.filter((e) => !ids.has(e.id));
  const dates = fresh.map((e) => e.date).sort();
  return {
    fresh,
    already: read.entries.length - fresh.length,
    minutes: fresh.reduce((sum, e) => sum + derive(e).total, 0),
    first: dates[0] ?? null,
    last: dates.at(-1) ?? null,
    doubts: fresh.filter((e) => doubtsAbout(e, today).length > 0).length,
  };
}
