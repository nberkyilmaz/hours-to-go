import { formatHours, today } from '../model/entry';
import { about, money, type Cost } from '../rules/cost';
import type { GoalResult } from '../rules/evaluate';
import { WINDOW_DAYS, dayText, finishOn, monthText, type Pace } from '../rules/pace';

interface Props {
  result: GoalResult;
  pace: Pace | null;
  /** Whether there is anything in the logbook; an empty one has its own call to add hours. */
  logged: boolean;
  /** What the same time left comes to, for what the pace costs a month. */
  cost: Cost | null;
}

const WEEKS_A_MONTH = 52 / 12;

/**
 * When the pilot reaches the goal's minimum at their pace, under the hours and the price (D40). The
 * time left is the plan the price is for, so the two always agree.
 */
export function Finish({ result: r, pace, logged, cost }: Props) {
  if (r.held || r.credited || r.complete) return null;
  const minutes = r.plan ? r.plan.dual + r.plan.sim + r.plan.solo : r.minutesToGo;
  if (minutes <= 0) return null;
  const weeks = WINDOW_DAYS / 7;
  if (!pace) return logged ? <p className="pace hint">A finish date needs two flights logged in the last {weeks} weeks.</p> : null;

  const now = today();
  const at = finishOn(minutes, pace, now);
  const typical = r.toAverage && at ? finishOn(minutes + r.toAverage.minutes, pace, now) : null;
  const monthly = cost && r.plan ? (cost.total / minutes) * pace.perWeek * WEEKS_A_MONTH : null;
  return (
    <div className="pace">
      <p>
        At your pace, {formatHours(pace.perWeek)} h a week,{' '}
        {at ? (
          <>
            you’ll reach the minimum around <strong>{monthText(at, now)}</strong>
            {typical && r.toAverage && (
              <>
                , and the {r.toAverage.hours} h average around <strong>{monthText(typical, now)}</strong>
              </>
            )}
            .
          </>
        ) : (
          'the minimum is more than 5 years away.'
        )}
      </p>
      {monthly !== null && monthly > 0 && <p>That’s about {money(about(monthly))} a month at this pace.</p>}
      <p className="hint">
        From the flights and FTD sessions you logged {pace.whole ? `in the last ${weeks} weeks` : `since ${dayText(pace.since)}`}.
      </p>
    </div>
  );
}
