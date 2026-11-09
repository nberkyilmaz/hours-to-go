import { useState } from 'react';
import { formatHours, today } from '../model/entry';
import { about, money, type Cost } from '../rules/cost';
import type { GoalResult } from '../rules/evaluate';
import { WINDOW_DAYS, dayText, finishOn, monthText, monthsBetween, weeksBetween, type Pace } from '../rules/pace';
import { decimal, t } from '../i18n';

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
function WhatIf({ minutes, pace, cost }: { minutes: number; pace: Pace | null; cost: Cost | null }) {
  const start = pace ? Math.min(FASTEST, Math.max(SLOWEST, Math.round(pace.perWeek / 30) / 2)) : USUAL_HOURS;
  const [hours, setHours] = useState(start);
  const now = today();
  const perWeek = hours * 60;
  const at = finishOn(minutes, { perWeek, since: now, whole: true }, now);
  const usual = pace ? finishOn(minutes, pace, now) : null;
  const monthly = cost ? (cost.total / minutes) * perWeek * WEEKS_A_MONTH : null;
  return (
    <details className="what-if">
      <summary>{t('What if you flew more or less?')}</summary>
      <label className="what-if-pace">
        <span>{t('Hours a week')}</span>
        <input type="range" min={SLOWEST} max={FASTEST} step={0.5} value={hours} aria-valuetext={hoursWord(hours)} onChange={(e) => setHours(Number(e.target.value))} />
        <strong>{hoursWord(hours)}</strong>
      </label>
      <p aria-live="polite">
        <strong>{at ? t('Around {month}', { month: monthText(at, now) }) : t('More than 5 years away')}</strong>
        {monthly !== null && monthly > 0 && <> · {t('about {price} a month', { price: money(about(monthly)) })}</>}
      </p>
      {/* The slider rounds the pace to a half hour, so where it starts isn't a change. */}
      {at && usual && <p className="hint">{hours === start ? t('About the same as your pace.') : compared(at, usual)}</p>}
    </details>
  );
}

/**
 * When the pilot reaches the goal's minimum at their pace, under the hours and the price (D40). The
 * time left is the plan the price is for, so the two always agree.
 */
export function Finish({ result: r, pace, logged, cost }: Props) {
  if (r.held || r.credited || r.complete) return null;
  const minutes = r.plan ? r.plan.dual + r.plan.sim + r.plan.solo : r.minutesToGo;
  if (minutes <= 0) return null;
  const weeks = WINDOW_DAYS / 7;
  if (!pace) {
    return (
      <>
        {logged && <p className="pace hint">{t('A finish date needs two flights logged in the last')}{' '}{weeks}{' '}{t('weeks.')}</p>}
        <WhatIf minutes={minutes} pace={null} cost={cost} />
      </>
    );
  }

  const now = today();
  const at = finishOn(minutes, pace, now);
  const typical = r.toAverage && at ? finishOn(minutes + r.toAverage.minutes, pace, now) : null;
  const monthly = cost && r.plan ? (cost.total / minutes) * pace.perWeek * WEEKS_A_MONTH : null;
  return (
    <div className="pace">
      <p>
        {t('At your pace,')}{' '}{formatHours(pace.perWeek)}{' '}{t('h a week,')}{' '}
        {at ? (
          <>
            {t('you’ll reach the minimum around')}{' '}<strong>{monthText(at, now)}</strong>
            {typical && r.toAverage && (
              <>
                {t(', and the')}{' '}{r.toAverage.hours}{' '}{t('h average around')}{' '}<strong>{monthText(typical, now)}</strong>
              </>
            )}
            .
          </>
        ) : (
          t('the minimum is more than 5 years away.')
        )}
      </p>
      {monthly !== null && monthly > 0 && <p>{t('That’s about')}{' '}{money(about(monthly))}{' '}{t('a month at this pace.')}</p>}
      <p className="hint">
        {t('From the flights and FTD sessions you logged')}{' '}{pace.whole ? t('in the last {weeks} weeks', { weeks }) : t('since {date}', { date: dayText(pace.since) })}.
      </p>
      <WhatIf minutes={minutes} pace={pace} cost={cost} />
    </div>
  );
}
