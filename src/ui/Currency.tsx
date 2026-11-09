import { useMemo } from 'react';
import { dateText, today, type Entry } from '../model/entry';
import type { Profile } from '../model/profile';
import { currencyOf } from '../rules/currency';
import { CheckIcon } from './icons';

interface Props {
  entries: readonly Entry[];
  profile: Profile;
  updateProfile: (fn: (p: Profile) => Profile) => unknown;
}

/** For a licensed pilot: what has to be recent to fly, and carry passengers (D52). Folded while it's all fine. */
export function CurrencyCard({ entries, profile, updateProfile }: Props) {
  const items = useMemo(() => currencyOf(entries, profile, today()), [entries, profile]);
  if (!items) return null;
  const open = items.filter((i) => !i.current).length;
  const setDate = (key: string, date: string) =>
    updateProfile((p) => {
      const milestones = { ...p.milestones };
      if (date) milestones[key] = { date };
      else delete milestones[key];
      return { ...p, milestones };
    });
  return (
    <details className="card currency" open={open > 0}>
      <summary>
        Current to fly
        <span className={open > 0 ? 'warn-text' : 'muted'}>{open > 0 ? ` · ${open} to sort out` : ' · all good'}</span>
      </summary>
      <ul className="currency-list">
        {items.map((i) => (
          <li key={i.id}>
            <span className={`dot${i.current ? ' is-met' : ''}`} aria-hidden="true">
              {i.current && <CheckIcon />}
            </span>
            <div>
              <span>
                {i.label} <span className="cite">{i.cite}</span>
                <span className="sr-only">{i.current ? ' (current)' : ' (not current)'}</span>
              </span>
              {i.note && <p className="note">{i.note}</p>}
              {i.until && <p className="note muted">{i.current ? `Until ${dateText(i.until)}` : `Ran out on ${dateText(i.until)}`}</p>}
              {i.dateKey && (
                <label className="inline-field">
                  <span>Last done</span>
                  <input type="date" value={profile.milestones[i.dateKey]?.date ?? ''} onChange={(e) => setDate(i.dateKey!, e.target.value)} />
                </label>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="hint">Counts flights logged one by one, in an aircraft: paper totals can’t show dates, and a simulator only counts at Level B, C or D, which the log can’t tell. A flight review, a Transport Canada seminar and the self-paced study program all count as recurrent training (421.05(2)).</p>
    </details>
  );
}
