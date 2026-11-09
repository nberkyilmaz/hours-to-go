/**
 * A flight being timed on this device (D59). Only the moment it started is kept, so the clock runs on with the app
 * closed, the phone asleep, or no signal.
 */
import { decimal } from '../i18n';

const KEY = 'hours-to-go/flight-clock';

/** When the clock was started, or null when it isn't running. */
export function clockStart(): number | null {
  try {
    const kept = Number(localStorage.getItem(KEY));
    return Number.isFinite(kept) && kept > 0 ? kept : null;
  } catch {
    return null;
  }
}

/** Returns when it started. Where storage is refused it still runs for as long as the app stays open. */
export function startClock(now: number = Date.now()): number {
  try {
    localStorage.setItem(KEY, String(now));
  } catch {
    // The caller holds the time for now.
  }
  return now;
}

export function clearClock(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing was kept, then.
  }
}

export const clockMinutes = (start: number, now: number = Date.now()) => Math.max(0, Math.round((now - start) / 60_000));

/** As a pilot logs it, in tenths of an hour. */
export const clockHours = (minutes: number) => decimal((Math.round(minutes / 6) / 10).toFixed(1));
