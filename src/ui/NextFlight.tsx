import { useMemo } from 'react';
import { formatHours, formatHoursUp, today, type Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import { about, money } from '../rules/cost';
import type { GoalResult } from '../rules/evaluate';
import { nextFlights, type FlightCount } from '../rules/next';
import { t } from '../i18n';

const amount = (c: FlightCount, n: number) => (c.unit === 'hours' ? `${formatHoursUp(n)} h` : String(n));

/** The flight that counts toward the most of what is left (D43). A suggestion to take to the instructor. */
interface Props {
  result: GoalResult;
  entries: readonly Entry[];
  profile: Profile;
  /** Opens the form on this flight, once it's been flown. */
  onFly: (line: Partial<Entry>) => void;
}

export function NextFlightCard({ result: r, entries, profile, onFly }: Props) {
  const advice = useMemo(() => nextFlights(r.goal, entries, profile, today()), [r.goal, entries, profile]);
  // An empty logbook has its own call to add hours.
  if (!advice || entries.length === 0) return null;

  if (advice.status === 'before-solo') {
    return (
      <section className="next" aria-labelledby="next-title">
        <h2 id="next-title">{t('Your next flight')}</h2>
        <p className="hint">{t('Before your first solo, your school’s lessons set the order. Once a solo is in your log, this suggests the flight that counts toward the most.')}</p>
      </section>
    );
  }

  const { best, others } = advice;
  const n = best.counts.length;
  return (
    <section className="next" aria-labelledby="next-title">
      <h2 id="next-title">{t('Your next flight')}</h2>
      <p>
        <strong>{t(best.name)}</strong>, {formatHours(best.minutes)}{' '}{t('h, about')}{' '}{money(about(best.price))}
      </p>
      <details className="next-why">
        <summary>{n === 1 ? t('It counts toward 1 requirement you still need') : t('It counts toward {n} requirements you still need', { n })}</summary>
        <ul className="next-counts">
          {best.counts.map((c) => (
            <li key={c.id}>
              <span>{t(c.label)}</span>
              <span className="next-left">
                {amount(c, c.before)} → {c.after === 0 ? t('done') : t('{amount} to go', { amount: amount(c, c.after) })}
              </span>
            </li>
          ))}
        </ul>
        {best.couldBe.map((label) => (
          <p className="note" key={label}>
            {t('This flight could also be one you still need:')}{' '}{t(label)}.
          </p>
        ))}
        {others.length > 0 && <p className="note">{t('Also useful:')}{' '}{others.map((f) => t(f.name)).join(' · ')}.</p>}
        <p className="note">{t('Worked out from the standard’s minimums, at your usual flight length.')}</p>
      </details>
      <button type="button" className="link" onClick={() => onFly(best.line)}>
        {t('I flew this')}
      </button>
      <p className="hint">{t('A suggestion. Your instructor decides what you fly next and when you’re ready for it.')}</p>
    </section>
  );
}
