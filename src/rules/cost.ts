/**
 * What the flying still to do costs, at the pilot's school's rates (D39). The hours come from a
 * goal's plan: the least Transport Canada allows, laid out the way schools teach it.
 */
import type { Rates } from '../model/profile';
import type { Plan } from './goals';
import { numberFormat } from '../i18n';

export interface CostLine {
  kind: 'dual' | 'sim' | 'solo';
  /** As a school bills them: in tenths of an hour, rounded up. */
  hours: number;
  /** Dollars an hour, before tax. */
  rate: number;
  amount: number;
}

export interface Cost {
  /** Only the kinds of time there is some of. */
  lines: CostLine[];
  subtotal: number;
  tax: number;
  total: number;
  /** What one more hour adds, tax included: each hour past the minimum is one of these. */
  perHour: { dual: number; solo: number };
}

const tenths = (minutes: number) => Math.ceil(minutes / 6) / 10;
const cents = (n: number) => Math.round(n * 100) / 100;

export function priceOf(plan: Plan, rates: Rates): Cost {
  const withTax = (n: number) => cents(n * (1 + rates.tax / 100));
  const rate = { dual: rates.aircraft + rates.instructor, sim: (rates.sim ?? 0) + rates.instructor, solo: rates.aircraft };
  const lines = (['dual', 'sim', 'solo'] as const)
    .filter((kind) => plan[kind] > 0)
    .map((kind): CostLine => {
      const hours = tenths(plan[kind]);
      return { kind, hours, rate: rate[kind], amount: cents(hours * rate[kind]) };
    });
  const subtotal = cents(lines.reduce((t, l) => t + l.amount, 0));
  const tax = cents((subtotal * rates.tax) / 100);
  return { lines, subtotal, tax, total: cents(subtotal + tax), perHour: { dual: withTax(rate.dual), solo: withTax(rate.solo) } };
}

const step = (dollars: number) => (dollars >= 1000 ? 100 : 10);

/** An estimate, not a quote: to the $100 from $1,000 up, to the $10 below. */
export function about(dollars: number): number {
  return Math.round(dollars / step(dollars)) * step(dollars);
}

/** The headline, which says "at least": rounded down the same way, so it never tops the panel's total. */
export function atLeast(dollars: number): number {
  return Math.floor(dollars / step(dollars)) * step(dollars);
}

const WHOLE: Intl.NumberFormatOptions = { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 };
const CENTS: Intl.NumberFormatOptions = { style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** "$14,500": whole dollars. */
export const money = (dollars: number) => numberFormat(WHOLE).format(dollars);
/** "$212.50" or "$220": a rate as the school prints it. */
export const rateText = (dollars: number) => numberFormat(Number.isInteger(dollars) ? WHOLE : CENTS).format(dollars);
