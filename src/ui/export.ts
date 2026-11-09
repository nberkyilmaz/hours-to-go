import { today } from '../model/entry';
import type { Logbook } from '../model/store';

/** Downloads the logbook as a file this app can read back. */
export function exportLogbook(book: Logbook): void {
  const blob = new Blob([JSON.stringify(book, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hours-to-go-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
