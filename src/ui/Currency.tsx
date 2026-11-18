import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { dateText, today, type Entry } from '../model/entry';
import type { Profile, RecentLandings } from '../model/profile';
import { MAX_LANDING_LINES } from '../model/store';
import { currencyOf, lastTotals } from '../rules/currency';
import { MedicalFields } from './Medical';
import { CheckIcon } from './icons';
import { t } from '../i18n';

type UpdateProfile = (fn: (p: Profile) => Profile) => unknown;

interface Props {
  entries: readonly Entry[];
  profile: Profile;
  updateProfile: UpdateProfile;
}

/**
 * For a licensed pilot: what has to be recent to fly, and carry passengers (D52). Folded while it's all fine, and open
 * with the questions in it when something isn't (D70).
 */
export function CurrencyCard({ entries, profile, updateProfile }: Props) {
  const items = useMemo(() => currencyOf(entries, profile, today()), [entries, profile]);
  const open = items?.filter((i) => !i.current).length ?? 0;
  // Nothing logged at all, a list of alarms would only say that (D65). Once open it stays open while it's being
  // answered, rather than snapping shut on the last answer; something newly wrong opens it again.
  const [isOpen, setOpen] = useState(open > 0 && entries.length > 0);
  const seen = useRef(open);
  useEffect(() => {
    if (open > seen.current && entries.length > 0) setOpen(true);
    seen.current = open;
  }, [open, entries.length]);
  if (!items) return null;
  const upTo = lastTotals(entries);
  const landingsShort = items.some((i) => i.landings && !i.current);
  const multiToo = profile.held.multi !== undefined || items.some((i) => i.id.endsWith('-multi'));
  const setDate = (key: string, date: string) =>
    updateProfile((p) => {
      const milestones = { ...p.milestones };
      if (date) milestones[key] = { date };
      else delete milestones[key];
      return { ...p, milestones };
    });
  let medicalAsked = false;
  return (
    <details className="card currency" open={isOpen} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {t('Current to fly')}
        <span className={open > 0 ? 'warn-text' : 'muted'}>{open > 0 ? ` · ${t('{n} to sort out', { n: open })}` : t(' · all good')}</span>
      </summary>
      <ul className="currency-list">
        {items.map((i) => {
          const askMedical = i.medical === true && !i.current && !medicalAsked;
          if (askMedical) medicalAsked = true;
          return (
            <li key={i.id}>
              <span className={`dot${i.current ? ' is-met' : ''}`} aria-hidden="true">
                {i.current && <CheckIcon />}
              </span>
              <div>
                <span>
                  {i.label} <span className="cite">{i.cite}</span>
                  <span className="sr-only">{i.current ? t(' (current)') : t(' (not current)')}</span>
                </span>
                {i.note && <p className="note">{i.note}</p>}
                {i.until && <p className="note muted">{i.current ? t('Until {date}', { date: dateText(i.until) }) : t('Ran out on {date}', { date: dateText(i.until) })}</p>}
                {i.from && <p className="note muted">{i.from}</p>}
                {i.dateKey && (
                  <label className="inline-field">
                    <span>{t('Last done')}</span>
                    <input type="date" max={today()} value={profile.milestones[i.dateKey]?.date ?? ''} onChange={(e) => setDate(i.dateKey!, e.target.value)} />
                  </label>
                )}
                {askMedical && <MedicalFields label={t('Your medical')} profile={profile} updateProfile={updateProfile} />}
              </div>
            </li>
          );
        })}
      </ul>
      {upTo && <PaperLandings profile={profile} updateProfile={updateProfile} upTo={upTo} multiToo={multiToo} open={landingsShort} />}
      <p className="hint">
        {t('Counts flights logged here one by one in an aircraft, and the lines you copy from your paper logbook. A simulator only counts at Level B, C or D, which the log can’t tell. A flight review, a Transport Canada seminar and the self-paced study program all count as recurrent training (421.05(2)).')}
      </p>
    </details>
  );
}

const readCount = (s: string) => (s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

/**
 * The last lines of the paper logbook, with their dates: paper totals can't show when a landing was, and carrying
 * passengers needs 5 in the last 6 months (CAR 401.05(2)(b)). They're already in the totals, so they add no time.
 */
function PaperLandings({ profile, updateProfile, upTo, multiToo, open }: { profile: Profile; updateProfile: UpdateProfile; upTo: string; multiToo: boolean; open: boolean }) {
  const [isOpen, setOpen] = useState(open);
  const [date, setDate] = useState('');
  const [day, setDay] = useState('');
  const [night, setNight] = useState('');
  const [multi, setMulti] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = profile.landings;

  const add = (ev: FormEvent) => {
    ev.preventDefault();
    const d = readCount(day);
    const n = readCount(night);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError(t('Enter the date of the flight.'));
    if (date > upTo) return setError(t('That’s after your paper totals, which go up to {date}. Log that flight in the app instead.', { date: dateText(upTo) }));
    if (d === null || n === null) return setError(t('Takeoffs and landings are whole numbers.'));
    if (d + n === 0) return setError(t('Enter how many takeoffs and landings, by day or at night.'));
    const line: RecentLandings = { date, day: d, night: n, multi: multiToo && multi };
    updateProfile((p) => ({ ...p, landings: [...p.landings, line].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, MAX_LANDING_LINES) }));
    setError(null);
    setDate('');
    setDay('');
    setNight('');
  };
  const remove = (index: number) => updateProfile((p) => ({ ...p, landings: p.landings.filter((_, i) => i !== index) }));

  return (
    <details className="paper-landings" open={isOpen} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{lines.length > 0 ? t('Takeoffs and landings from your paper logbook ({n})', { n: lines.length }) : t('Add your last takeoffs and landings from your paper logbook')}</summary>
      <p className="hint">
        {t('Your paper totals can’t show when your takeoffs and landings were. Copy the last few lines from your paper logbook, up to {date}: enough for 5 by day, and 5 at night if you carry passengers at night. They’re already in your totals, so no time is added.', { date: dateText(upTo) })}
      </p>
      {lines.length > 0 && (
        <ul className="paper-landings-list">
          {lines.map((l, i) => (
            <li key={`${l.date}-${i}`}>
              <span>
                <strong>{dateText(l.date)}</strong>
                {' · '}
                {[l.day > 0 ? t('{n} by day', { n: l.day }) : '', l.night > 0 ? t('{n} at night', { n: l.night }) : '', l.multi ? t('multi-engine') : ''].filter(Boolean).join(' · ')}
              </span>
              <button type="button" className="link danger" onClick={() => remove(i)} aria-label={t('Remove the line of {date}', { date: dateText(l.date) })}>
                {t('Remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="paper-landings-add" onSubmit={add} noValidate>
        <div className="field compact">
          <label htmlFor="pl-date">{t('Date')}</label>
          <input id="pl-date" type="date" max={upTo} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field compact">
          <label htmlFor="pl-day">{t('By day')}</label>
          <input id="pl-day" className="narrow" inputMode="numeric" placeholder="0" autoComplete="off" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="field compact">
          <label htmlFor="pl-night">{t('At night')}</label>
          <input id="pl-night" className="narrow" inputMode="numeric" placeholder="0" autoComplete="off" value={night} onChange={(e) => setNight(e.target.value)} />
        </div>
        {multiToo && (
          <label className="toggle">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
            <span>{t('Multi-engine')}</span>
          </label>
        )}
        <button type="submit" className="btn small">
          {t('Add this line')}
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
