import { useState, type RefObject } from 'react';
import { SAMPLE_RATES, type Profile, type Rates } from '../model/profile';
import { about, atLeast, money, priceOf, rateText, type Cost, type CostLine } from '../rules/cost';
import type { GoalResult } from '../rules/evaluate';
import type { Priced } from '../rules/goals';
import { keepUnits } from './text';
import { t } from '../i18n';

type UpdateProfile = (fn: (p: Profile) => Profile) => unknown;

/**
 * The goal's price at the pilot's rates, or null when no time is left to pay for (D39). A price
 * of $0 still shows, so the rates form stays while the pilot clears a box to retype it.
 */
export function costOf(r: GoalResult, profile: Profile): Cost | null {
  if (!r.plan || r.held || r.credited || r.complete || r.plan.dual + r.plan.sim + r.plan.solo === 0) return null;
  return priceOf(r.plan, profile.rates ?? SAMPLE_RATES);
}

interface StatProps {
  result: GoalResult;
  cost: Cost;
  profile: Profile;
  onRates: () => void;
}

/**
 * Sits beside the hours left in the goal's summary: the minimum's price, which is a floor like the
 * hours, then what most students pay, and a way to the rates while they are the sample ones.
 */
export function CostStat({ result: r, cost, profile, onRates }: StatProps) {
  const typical = typicalOf(r, cost);
  return (
    <div className="stat stat-money">
      <span className="stat-value">{money(atLeast(cost.total))}</span>
      <span className="stat-label">{t('left to pay, at least')}</span>
      {typical && (
        <span className="stat-more">
          {t('About {price} at the {hours} h average', { price: money(about(typical.total)), hours: typical.hours })}
        </span>
      )}
      {profile.rates === null && (
        <span className="stat-more muted">
          {t('At sample rates.')}{' '}
          <button type="button" className="link" onClick={onRates}>
            {t('Enter your school’s rates')}
          </button>
        </span>
      )}
    </div>
  );
}

/** Opens the panel at the rates, with the aeroplane's box ready to type in. */
export function openRates(panel: HTMLDetailsElement | null) {
  if (!panel) return;
  panel.open = true;
  panel.querySelector<HTMLInputElement>('#rate-aircraft')?.focus();
}

/** The price at the hours schools quote as the average (the PPL's 65 h), while the pilot is short of them. */
function typicalOf(r: GoalResult, cost: Cost): { hours: number; total: number } | null {
  if (!r.toAverage) return null;
  // Past the minimum, schools add hours with an instructor.
  return { hours: r.toAverage.hours, total: cost.total + (Math.ceil(r.toAverage.minutes / 6) / 10) * cost.perHour.dual };
}

function lineLabel(l: CostLine, pricing: Priced): string {
  if (l.kind === 'dual') return t('with an instructor');
  if (l.kind === 'sim') return t('in a simulator, with an instructor');
  return t(pricing.solo);
}

interface Props {
  result: GoalResult;
  cost: Cost;
  profile: Profile;
  updateProfile: UpdateProfile;
  panel: RefObject<HTMLDetailsElement>;
}

/** How the price is worked out, and where the pilot puts their school's rates. */
export function CostDetail({ result: r, cost, profile, updateProfile, panel }: Props) {
  const pricing = r.goal.cost;
  if (!('plan' in pricing)) return null;
  const rates = profile.rates ?? SAMPLE_RATES;
  const own = profile.rates !== null;
  const hasSolo = cost.lines.some((l) => l.kind === 'solo');
  const typical = typicalOf(r, cost);

  return (
    <details className="cost" ref={panel}>
      <summary>
        {t('How the cost is worked out')}{' '}
        <span className="muted">{own ? t('· your school’s rates') : t('· sample rates')}</span>
      </summary>
      <table className="type-table cost-table">
        <caption className="sr-only">{t('The cost to go, line by line')}</caption>
        <tbody>
          {cost.lines.map((l) => (
            <tr key={l.kind}>
              <th scope="row">
                {l.hours.toFixed(1)}{' '}{t('h')}{' '}{lineLabel(l, pricing)}
              </th>
              <td>× {rateText(l.rate)}</td>
              <td>{money(l.amount)}</td>
            </tr>
          ))}
          {cost.tax > 0 && (
            <tr>
              <th scope="row">{t('Tax,')}{' '}{rates.tax}%</th>
              <td />
              <td>{money(cost.tax)}</td>
            </tr>
          )}
          <tr className="cost-total">
            <th scope="row">{t('In all')}</th>
            <td />
            <td>{money(cost.total)}</td>
          </tr>
        </tbody>
      </table>
      <p>
        {t('Each hour past the minimum adds about')}{' '}{money(cost.perHour.dual)}{' '}{t('with an instructor')}
        {hasSolo ? t(', or {price} {what}', { price: money(cost.perHour.solo), what: t(pricing.solo) }) : ''}{t(', tax included.')}
        {typical && (
          <>
            {' '}
            {t('Most students need more than the minimum: schools often quote')}{' '}{typical.hours}{' '}{t('h as the national average. At')}{' '}{typical.hours}{' '}{t('h, it would be about')}{' '}<strong>{money(about(typical.total))}</strong>.
          </>
        )}
      </p>
      <p className="note">{keepUnits(t(pricing.note))}</p>
      {pricing.vocational && (
        <p className="note">
          {t('A vocational school may not charge GST or HST on this training up to the minimum hours (CRA GST/HST Memorandum 20-4). If yours doesn’t, set the tax to 0.')}
        </p>
      )}
      <p className="note">{t('Not counted: ground school, briefings, exam and flight test fees, your medical and your licence.')}</p>

      <RatesForm rates={rates} own={own} updateProfile={updateProfile} />
    </details>
  );
}

type Field = keyof Rates;

function RatesForm({ rates, own, updateProfile }: { rates: Rates; own: boolean; updateProfile: UpdateProfile }) {
  // The boxes keep what is typed; going back to the sample rates refills them. Keying them on
  // whether the rates are the pilot's own would rebuild the box being typed in at the first key.
  const [refill, setRefill] = useState(0);
  const set = (field: Field, value: number | null) =>
    updateProfile((p) => ({ ...p, rates: { ...(p.rates ?? SAMPLE_RATES), [field]: field === 'sim' ? value : (value ?? 0) } }));

  return (
    <fieldset className="rates">
      <legend>{t('Your school’s rates')}</legend>
      {!own && (
        <p className="hint">
          {t('Until you change them, these are sample rates:')}{' '}{rateText(SAMPLE_RATES.aircraft)}{' '}{t('an hour for a Cessna 172 with fuel, as Ontario clubs charge,')}{' '}{rateText(SAMPLE_RATES.instructor)}{' '}{t('for the instructor and')}{' '}{SAMPLE_RATES.tax}{t('% tax.')}
        </p>
      )}
      <div className="rates-grid" key={refill}>
        <RateField field="aircraft" label={t('Aeroplane, $ an hour')} hint={t('With fuel and any fuel surcharge.')} value={rates.aircraft} set={set} />
        <RateField field="instructor" label={t('Instructor, $ an hour')} value={rates.instructor} set={set} />
        <RateField field="sim" label={t('Simulator, $ an hour')} hint={t('Empty if you won’t use one.')} value={rates.sim} set={set} />
        <RateField field="tax" label={t('Tax, %')} hint={t('13 for Ontario’s HST, 5 where only GST applies.')} value={rates.tax} set={set} />
      </div>
      <p className="hint">{t('If your school quotes a dual rate with the instructor in it, put its solo rate as the aeroplane and the difference as the instructor.')}</p>
      {own && (
        <button
          type="button"
          className="link"
          onClick={() => {
            updateProfile((p) => ({ ...p, rates: null }));
            setRefill((n) => n + 1);
          }}
        >
          {t('Use the sample rates')}
        </button>
      )}
    </fieldset>
  );
}

interface FieldProps {
  field: Field;
  label: string;
  hint?: string;
  value: number | null;
  set: (field: Field, value: number | null) => void;
}

/** Keeps what is typed, so "21" on the way to "212.5" stays as typed; saves each number as it comes. */
function RateField({ field, label, hint, value, set }: FieldProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const id = `rate-${field}`;
  return (
    <div className="field compact">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={text}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() === '') set(field, null);
          else if (Number.isFinite(n) && n >= 0) set(field, n);
        }}
      />
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
