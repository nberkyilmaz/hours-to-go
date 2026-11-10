import { useState } from 'react';
import { formatHours, today } from '../model/entry';
import { about, money, type Cost } from '../rules/cost';
import type { GoalResult } from '../rules/evaluate';
import { WINDOW_DAYS, dayText, finishOn, monthText, monthsBetween, weeksBetween, type Pace } from '../rules/pace';
import { decimal, t } from '../i18n';
import { keepUnits } from './text';

interface Props {
  result: GoalResult;
  pace: Pace | null;
  /** Whether there is anything in the logbook; an empty one has its own call to add hours. */
  logged: boolean;
  /** What the same time left comes to, for what the pace costs a month. */
  cost: Cost | null;
}

const WEEKS_A_MONTH = 52 / 12;
const SLOWEST = 0.5;
const FASTEST = 15;
/** Where the slider starts for someone with no pace yet: a lesson or two a week. */
const USUAL_HOURS = 2;
/** From here on a difference is counted in months. */
const WEEKS_COUNTED = 8;

const hoursWord = (hours: number) => t('{n} h a week', { n: decimal(String(hours)) });

/** Within a month of the end, a month's flying would cost more than what's left. */
const pastTheEnd = (monthly: number, cost: Cost) => monthly >= cost.total;

function compared(at: string, usual: string): string {
  const weeks = weeksBetween(usual, at);
  if (weeks === 0) return t('About the same as your pace.');
  if (weeks === -1) return t('1 week sooner than your pace.');
  if (weeks === 1) return t('1 week later than your pace.');
  if (Math.abs(weeks) < WEEKS_COUNTED) return weeks < 0 ? t('{n} weeks sooner than your pace.', { n: -weeks }) : t('{n} weeks later than your pace.', { n: weeks });
  const months = monthsBetween(usual, at);
  return months < 0 ? t('{n} months sooner than your pace.', { n: -months }) : t('{n} months later than your pace.', { n: months });
}

/** Moves the same sum the finish date does, at a pace the pilot picks (D58): nothing here is saved. */
function WhatIfSlider({ minutes, pace, cost }: { minutes: number; pace: Pace | null; cost: Cost | null }) {
  const start = pace ? Math.min(FASTEST, Math.max(SLOWEST, Math.round(pace.perWeek / 30) / 2)) : USUAL_HOURS;
  // Null until it's moved: the slider stops on half hours, and the figures here match the pilot's own pace above.
  const [picked, setPicked] = useState<number | null>(null);
  const now = today();
  const perWeek = picked !== null ? picked * 60 : pace ? pace.perWeek : USUAL_HOURS * 60;
  const word = picked === null && pace ? t('{n} h a week', { n: formatHours(pace.perWeek) }) : hoursWord(picked ?? start);
  const at = finishOn(minutes, { perWeek, since: now, whole: true }, now);
  const usual = pace ? finishOn(minutes, pace, now) : null;
  const monthly = cost ? (cost.total / minutes) * perWeek * WEEKS_A_MONTH : null;
  return (
    <details className="what-if">
      <summary>{t('What if you flew more or less?')}</summary>
      <label className="what-if-pace">
        <span>{t('Hours a week')}</span>
        <input type="range" min={SLOWEST} max={FASTEST} step={0.5} value={picked ?? start} aria-valuetext={word} onChange={(e) => setPicked(Number(e.target.value))} />
        <strong>{word}</strong>
      </label>
      <p aria-live="polite">
        <strong>{at ? t('Around {month}', { month: monthText(at, now) }) : t('More than 5 years away')}</strong>
        {monthly !== null && monthly > 0 && <> · {cost && pastTheEnd(monthly, cost) ? t('about {price} to finish', { price: money(about(cost.total)) }) : t('about {price} a month', { price: money(about(monthly)) })}</>}
      </p>
      {at && usual && <p className="hint">{compared(at, usual)}</p>}
      {pace && <p className="hint">{t('From the flights and FTD sessions you logged')}{' '}{pace.whole ? t('in the last {weeks} weeks', { weeks: WINDOW_DAYS / 7 }) : t('since {date}', { date: dayText(pace.since) })}.</p>}
    </details>
  );
}

/** The time the price is for, or nothing when there's no time left to plan. */
function minutesLeft(r: GoalResult): number | null {
  if (r.held || r.credited || r.complete) return null;
  const minutes = r.plan ? r.plan.dual + r.plan.sim + r.plan.solo : r.minutesToGo;
  return minutes > 0 ? minutes : null;
}

export function WhatIf({ result, pace, cost }: { result: GoalResult; pace: Pace | null; cost: Cost | null }) {
  const minutes = minutesLeft(result);
  return minutes === null ? null : <WhatIfSlider minutes={minutes} pace={pace} cost={cost} />;
}

/**
 * When the pilot reaches the goal's minimum at their pace, under the hours and the price (D40). The
 * time left is the plan the price is for, so the two always agree.
 */
export function Finish({ result: r, pace, logged, cost }: Props) {
  const minutes = minutesLeft(r);
  if (minutes === null) return null;
  if (!pace) return logged ? <p className="pace hint">{t('A finish date needs two flights logged in the last')}{' '}{WINDOW_DAYS / 7}{' '}{t('weeks.')}</p> : null;

  const now = today();
  const at = finishOn(minutes, pace, now);
  const typical = r.toAverage && at ? finishOn(minutes + r.toAverage.minutes, pace, now) : null;
  const monthly = cost && r.plan ? (cost.total / minutes) * pace.perWeek * WEEKS_A_MONTH : null;
  const more = [
    typical && r.toAverage ? t('{hours} h average: around {month}', { hours: r.toAverage.hours, month: monthText(typical, now) }) : null,
    monthly !== null && monthly > 0 && cost ? (pastTheEnd(monthly, cost) ? t('about {price} to finish', { price: money(about(cost.total)) }) : t('about {price} a month', { price: money(about(monthly)) })) : null,
  ].filter(Boolean);
  return (
    <div className="pace">
      <p>
        <strong>{at ? t('Minimum around {month}', { month: monthText(at, now) }) : t('More than 5 years away')}</strong>{' '}{keepUnits(t('at your pace, {n} h a week', { n: formatHours(pace.perWeek) }))}
      </p>
      {more.length > 0 && <p className="hint">{keepUnits(more.join(' · '))}</p>}
    </div>
  );
}
