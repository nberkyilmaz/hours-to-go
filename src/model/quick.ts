/**
 * The quick form's few choices, and what they mean in the paper log's columns (D46). The columns
 * stay the record: this is a faster way to fill them for a flight of the ordinary shape.
 */
import { durationText, type Entry } from './entry';

export type QuickKind = 'dual' | 'solo' | 'pic';

export interface Quick {
  /** Null until chosen: a flight logged as the wrong kind would count toward the wrong requirements. */
  kind: QuickKind | null;
  /** The flight time, as typed. */
  time: string;
  night: boolean;
  xc: boolean;
  hood: boolean;
  /** Time under the hood as typed; blank is the whole flight. */
  hoodTime: string;
  landings: number;
}

const COLUMNS = ['seDayDual', 'seDayPic', 'seNightDual', 'seNightPic', 'xcDayDual', 'xcDayPic', 'xcNightDual', 'xcNightPic', 'hood', 'dayLandings', 'nightLandings'] as const;
type QuickColumn = (typeof COLUMNS)[number];

/** A flight ends in a landing, so it starts at one. */
export const blankQuick = (): Quick => ({ kind: null, time: '', night: false, xc: false, hood: false, hoodTime: '', landings: 1 });

/** The boxes of the paper columns these choices fill, every one of them, so a changed choice clears the old. */
export function quickText(q: Quick): Record<QuickColumn, string> {
  const text = Object.fromEntries(COLUMNS.map((c) => [c, ''])) as Record<QuickColumn, string>;
  const when = q.night ? 'Night' : 'Day';
  if (q.kind) {
    const role = q.kind === 'dual' ? 'Dual' : 'Pic';
    text[`se${when}${role}`] = q.time;
    if (q.xc) text[`xc${when}${role}`] = q.time;
  }
  if (q.hood) text.hood = q.hoodTime.trim() || q.time;
  text[q.night ? 'nightLandings' : 'dayLandings'] = q.landings > 0 ? String(q.landings) : '';
  return text;
}

/**
 * The choices for a line already logged, or null when it doesn't fit them: time in more than one
 * column, multi-engine, or anything else only the paper columns can hold. That opens the columns.
 */
export function quickFrom(e: Entry): Quick | null {
  if (e.forward || e.breakdown) return null;
  if (e.meDayDual || e.meDayPic || e.meDayCopilot || e.meNightDual || e.meNightPic || e.meNightCopilot) return null;
  if (e.actualImc || e.ftd || e.approaches || e.soloNightLandings) return null;
  const flown = [e.seDayDual, e.seDayPic, e.seNightDual, e.seNightPic].filter((m) => m > 0);
  if (flown.length !== 1) return null;
  const minutes = flown[0]!;
  const night = e.seNightDual > 0 || e.seNightPic > 0;
  const pic = e.seDayPic > 0 || e.seNightPic > 0;
  if (e.solo && !pic) return null;
  const xcMine = night ? (pic ? e.xcNightPic : e.xcNightDual) : pic ? e.xcDayPic : e.xcDayDual;
  const xcAll = e.xcDayDual + e.xcDayPic + e.xcNightDual + e.xcNightPic;
  if (xcAll !== xcMine || (xcMine !== 0 && xcMine !== minutes)) return null;
  if (night ? e.dayLandings : e.nightLandings) return null;
  if (e.hood > minutes) return null;
  return {
    kind: pic ? (e.solo ? 'solo' : 'pic') : 'dual',
    time: durationText(minutes),
    night,
    xc: xcMine > 0,
    hood: e.hood > 0,
    hoodTime: e.hood > 0 && e.hood !== minutes ? durationText(e.hood) : '',
    landings: night ? e.nightLandings : e.dayLandings,
  };
}
