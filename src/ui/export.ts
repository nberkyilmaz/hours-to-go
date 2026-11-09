import { toCsv } from '../model/csv';
import { today } from '../model/entry';
import type { Logbook } from '../model/store';

export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const download = (content: string, type: string, name: string) => saveFile(new Blob([content], { type }), name);

/** Downloads the logbook as a file this app can read back. */
export function exportLogbook(book: Logbook): void {
  download(JSON.stringify(book, null, 2), 'application/json', `hours-to-go-${today()}.json`);
}

/** Downloads the logbook for Excel: every line, without the profile or the answers on paper totals. */
export function exportSpreadsheet(book: Logbook): void {
  download(toCsv(book.entries), 'text/csv;charset=utf-8', `hours-to-go-${today()}.csv`);
}
