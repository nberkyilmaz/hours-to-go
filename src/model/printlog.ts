/**
 * The logbook as pages, the way a paper log adds them up: each page's totals, what was brought forward, and the total
 * to date (D55). A fixed number of one-line rows, so a page can't spill onto the next and put its totals out of step.
 */
import { COUNT_COLUMNS, TIME_COLUMNS, type Column, type Entry } from './entry';

export const ROWS_PER_PAGE = 26;
/** What fits on a row. Anything longer is cut short there and written out in full after the last page. */
export const REMARKS_SHOWN = 26;

export type ColumnTotals = Record<Column, number>;

export interface PrintPage {
  rows: Entry[];
  page: ColumnTotals;
  forward: ColumnTotals;
  toDate: ColumnTotals;
}

const COLUMNS: readonly Column[] = [...TIME_COLUMNS, ...COUNT_COLUMNS];
const zeros = () => Object.fromEntries(COLUMNS.map((c) => [c, 0])) as ColumnTotals;
const plus = (a: ColumnTotals, b: ColumnTotals) => Object.fromEntries(COLUMNS.map((c) => [c, a[c] + b[c]])) as ColumnTotals;

/** Oldest first, and paper totals ahead of a flight on the same day, since they came before it. */
export function inLogOrder(entries: readonly Entry[]): Entry[] {
  return [...entries].sort((a, b) => (a.date === b.date ? Number(b.forward) - Number(a.forward) : a.date < b.date ? -1 : 1));
}

export function printPages(entries: readonly Entry[], perPage: number = ROWS_PER_PAGE): PrintPage[] {
  const lines = inLogOrder(entries);
  const pages: PrintPage[] = [];
  let forward = zeros();
  for (let i = 0; i < lines.length; i += perPage) {
    const rows = lines.slice(i, i + perPage);
    const page = rows.reduce((sum, e) => plus(sum, e), zeros());
    const toDate = plus(forward, page);
    pages.push({ rows, page, forward, toDate });
    forward = toDate;
  }
  return pages;
}

/** The remarks a row prints, with what the columns can't show. */
export function remarksOf(e: Entry): string {
  return [e.forward ? 'Brought forward' : '', e.solo ? 'Solo' : '', e.remarks.replace(/\s+/g, ' ').trim()].filter(Boolean).join(' · ');
}

export const remarksCut = (e: Entry) => {
  const text = remarksOf(e);
  return text.length > REMARKS_SHOWN ? `${text.slice(0, REMARKS_SHOWN - 1).trimEnd()}…` : text;
};

export const withLongRemarks = (entries: readonly Entry[]) => inLogOrder(entries).filter((e) => remarksOf(e).length > REMARKS_SHOWN);
