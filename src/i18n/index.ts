/**
 * The app's words in the pilot's language (D57). English is the source: a phrase is its own key, so the code reads as
 * it did, and anything not translated yet shows in English rather than breaking.
 *
 * The language is settled when the page loads, and changing it reloads the page, so `t` is a plain function that works
 * anywhere. The server answers pilots in both languages from one process, so it asks for a `translator` instead.
 */
import { FR } from './fr';

export type Lang = 'en' | 'fr';
type Values = Record<string, string | number>;

const LANG_KEY = 'hours-to-go/lang';

const fill = (text: string, values?: Values) => (values ? text.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all)) : text);

export const translator =
  (language: Lang) =>
  (text: string, values?: Values): string =>
    fill(language === 'fr' ? (FR[text] ?? text) : text, values);

/** What the pilot chose on this device, or else what their browser is set to. Always English on the server. */
function detect(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const kept = localStorage.getItem(LANG_KEY);
    if (kept === 'en' || kept === 'fr') return kept;
  } catch {
    // Private windows can refuse storage. The browser's language is still there.
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let current: Lang = detect();

export const lang = (): Lang => current;
const localeOf = (language: Lang) => (language === 'fr' ? 'fr-CA' : 'en-CA');
export const locale = () => localeOf(current);

/** Only for tests. The app changes language through `chooseLang`. */
export function setLang(language: Lang): void {
  current = language;
}

export function chooseLang(language: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, language);
  } catch {
    // Then it lasts until this page is closed: the reload below would lose it, so don't reload.
    current = language;
    return;
  }
  window.location.reload();
}

export const t = (text: string, values?: Values): string => translator(current)(text, values);

// Building a formatter is slow and the logbook asks for one per row, so each is kept once made.
const dates = new Map<string, Intl.DateTimeFormat>();

export function dateFormat(options: Intl.DateTimeFormatOptions, language: Lang = current): Intl.DateTimeFormat {
  const key = localeOf(language) + JSON.stringify(options);
  let found = dates.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(localeOf(language), options);
    dates.set(key, found);
  }
  return found;
}

const numbers = new Map<string, Intl.NumberFormat>();

export function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale() + JSON.stringify(options);
  let found = numbers.get(key);
  if (!found) {
    found = new Intl.NumberFormat(locale(), options);
    numbers.set(key, found);
  }
  return found;
}

/** The decimal mark a pilot expects: 1.5 in English, 1,5 in French. */
export const decimal = (text: string) => (current === 'fr' ? text.replace('.', ',') : text);
