import { useMemo } from 'react';
import { formatHours, formatHoursUp, today, type Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import { about, money } from '../rules/cost';
import type { GoalResult } from '../rules/evaluate';
import { nextFlights, type FlightCount } from '../rules/next';

const amount = (c: FlightCount, n: number) => (c.unit === 'hours' ? `${formatHoursUp(n)} h` : String(n));

/** The flight that counts toward the most of what is left (D43). A suggestion to take to the instructor. */
export function NextFlightCard({ result: r, entries, profile }: { result: GoalResult; entries: readonly Entry[]; profile: Profile }) {
  const advice = useMemo(() => nextFlights(r.goal, entries, profile, today()), [r.goal, entries, profile]);
  // An empty logbook has its own call to add hours.
  if (!advice || entries.length === 0) return null;

  if (advice.status === 'before-solo') {
    return (
      <section className="next" aria-labelledby="next-title">
        <h2 id="next-title">Your next flight</h2>
        <p className="hint">Before your first solo, your school’s lessons set the order. Once a solo is in your log, this suggests the flight that counts toward the most.</p>
      </section>
    );
  }

  const { best, others } = advice;
  const n = best.counts.length;
  return (
    <section className="next" aria-labelledby="next-title">
      <h2 id="next-title">Your next flight</h2>
      <p>
        <strong>{best.name}</strong>, {formatHours(best.minutes)} h, about {money(about(best.price))}
      </p>
      <details className="next-why">
        <summary>It counts toward {n === 1 ? '1 requirement' : `${n} requirements`} you still need</summary>
        <ul className="next-counts">
          {best.counts.map((c) => (
            <li key={c.id}>
              <span>{c.label}</span>
              <span className="next-left">
                {amount(c, c.before)} → {c.after === 0 ? 'done' : `${amount(c, c.after)} to go`}
              </span>
            </li>
          ))}
        </ul>
        {best.couldBe.map((label) => (
          <p className="note" key={label}>
            This flight could also be one you still need: {label}.
          </p>
        ))}
        {others.length > 0 && <p className="note">Also useful: {others.map((f) => f.name).join(' · ')}.</p>}
        <p className="note">Worked out from the standard’s minimums, at your usual flight length.</p>
      </details>
      <p className="hint">A suggestion. Your instructor decides what you fly next and when you’re ready for it.</p>
    </section>
  );
}
