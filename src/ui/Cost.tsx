import { useState } from 'react';
import { SAMPLE_RATES, type Profile, type Rates } from '../model/profile';
import { about, money, priceOf, rateText, type Cost, type CostLine } from '../rules/cost';
import type { GoalResult, ReqResult } from '../rules/evaluate';
import type { Priced } from '../rules/goals';

type UpdateProfile = (fn: (p: Profile) => Profile) => unknown;

/**
 * The goal's price at the pilot's rates, or null when no time is left to pay for (D39). A price
 * of $0 still shows, so the rates form stays while the pilot clears a box to retype it.
 */
export function costOf(r: GoalResult, profile: Profile): Cost | null {
  if (!r.plan || r.held || r.credited || r.complete || r.plan.dual + r.plan.sim + r.plan.solo === 0) return null;
  return priceOf(r.plan, profile.rates ?? SAMPLE_RATES);
}

/** Sits beside the hours left in the goal's summary. */
export function CostStat({ cost }: { cost: Cost }) {
  return (
    <div className="stat stat-money">
      <span className="stat-value">{money(about(cost.total))}</span>
      <span className="stat-label">left to pay, about</span>
    </div>
  );
}

const haveOf = (r: GoalResult, id: string): number => {
  const walk = (rs: readonly ReqResult[]): number | undefined => {
    for (const x of rs) {
      if (x.req.id === id) return x.have;
      const hit = walk(x.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(r.sections.flatMap((s) => s.results)) ?? 0;
};

function lineLabel(l: CostLine, pricing: Priced): string {
  if (l.kind === 'dual') return 'with an instructor';
  if (l.kind === 'sim') return 'in a simulator, with an instructor';
  return pricing.solo;
}

interface Props {
  result: GoalResult;
  cost: Cost;
  profile: Profile;
  updateProfile: UpdateProfile;
}

/** How the price is worked out, and where the pilot puts their school's rates. */
export function CostDetail({ result: r, cost, profile, updateProfile }: Props) {
  const pricing = r.goal.cost;
  if (!('plan' in pricing)) return null;
  const rates = profile.rates ?? SAMPLE_RATES;
  const own = profile.rates !== null;
  const hasSolo = cost.lines.some((l) => l.kind === 'solo');
  const avg = pricing.average;
  const planned = r.plan ? r.plan.dual + r.plan.sim + r.plan.solo : 0;
  // Past the minimum, schools add hours with an instructor.
  const beyond = avg ? avg.hours * 60 - haveOf(r, avg.of) - planned : 0;
  const atAverage = cost.total + (Math.ceil(beyond / 6) / 10) * cost.perHour.dual;

  return (
    <details className="cost">
      <summary>
        How the cost is worked out
        <span className="muted">{own ? ' · your school’s rates' : ' · sample rates'}</span>
      </summary>
      <table className="type-table cost-table">
        <caption className="sr-only">The cost to go, line by line</caption>
        <tbody>
          {cost.lines.map((l) => (
            <tr key={l.kind}>
              <th scope="row">
                {l.hours.toFixed(1)} h {lineLabel(l, pricing)}
              </th>
              <td>× {rateText(l.rate)}</td>
              <td>{money(l.amount)}</td>
            </tr>
          ))}
          {cost.tax > 0 && (
            <tr>
              <th scope="row">Tax, {rates.tax}%</th>
              <td />
              <td>{money(cost.tax)}</td>
            </tr>
          )}
          <tr className="cost-total">
            <th scope="row">In all</th>
            <td />
            <td>{money(cost.total)}</td>
          </tr>
        </tbody>
      </table>
      <p>
        Each hour past the minimum adds about {money(cost.perHour.dual)} with an instructor
        {hasSolo ? `, or ${money(cost.perHour.solo)} ${pricing.solo}` : ''}, tax included.
        {avg && beyond > 0 && (
          <>
            {' '}
            Most students need more than the minimum: schools often quote {avg.hours} h as the national average. At {avg.hours} h, it
            would be about <strong>{money(about(atAverage))}</strong>.
          </>
        )}
      </p>
      <p className="note">{pricing.note}</p>
      {pricing.vocational && (
        <p className="note">
          A vocational school may not charge GST or HST on this training up to the minimum hours (CRA GST/HST Memorandum 20-4). If
          yours doesn’t, set the tax to 0.
        </p>
      )}
      <p className="note">Not counted: ground school, briefings, exam and flight test fees, your medical and your licence.</p>

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
      <legend>Your school’s rates</legend>
      {!own && (
        <p className="hint">
          Until you change them, these are sample rates: {rateText(SAMPLE_RATES.aircraft)} an hour for a Cessna 172 with fuel, as Ontario
          clubs charge, {rateText(SAMPLE_RATES.instructor)} for the instructor and {SAMPLE_RATES.tax}% tax.
        </p>
      )}
      <div className="rates-grid" key={refill}>
        <RateField field="aircraft" label="Aeroplane, $ an hour" hint="With fuel and any fuel surcharge." value={rates.aircraft} set={set} />
        <RateField field="instructor" label="Instructor, $ an hour" value={rates.instructor} set={set} />
        <RateField field="sim" label="Simulator, $ an hour" hint="Empty if you won’t use one." value={rates.sim} set={set} />
        <RateField field="tax" label="Tax, %" hint="13 for Ontario’s HST, 5 where only GST applies." value={rates.tax} set={set} />
      </div>
      <p className="hint">If your school quotes a dual rate with the instructor in it, put its solo rate as the aeroplane and the difference as the instructor.</p>
      {own && (
        <button
          type="button"
          className="link"
          onClick={() => {
            updateProfile((p) => ({ ...p, rates: null }));
            setRefill((n) => n + 1);
          }}
        >
          Use the sample rates
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
