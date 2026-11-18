/**
 * How long a medical certificate lasts, from CAR 404.04 (D70). A Canadian certificate shows its category and the date of
 * the exam, not an end date, so the app works the end out the way Transport Canada does:
 *
 * - it runs from the exam (404.04(5)), and the end is counted from the first day of the month after it (404.04(7));
 * - for a commercial or airline transport licence, 12 months, or 6 at 60 or older (404.04(6.1), (6.2));
 * - for a private licence, 60 months under 40 and 24 at 40 or older (404.04(6));
 * - a commercial pilot whose 12 months are up keeps a private pilot's privileges to the end of the private period
 *   (404.04(6.3)), which is the "Category 1 turns into a Category 3" pilots talk about;
 * - a student pilot permit, 60 months at any age.
 *
 * The end is taken as the day before that count lands, the last day of a month: the regulation doesn't say whether the
 * day it lands on is still inside, and a day early is the safe side.
 */
import { addDays, addMonths } from '../model/entry';
import type { Medical, MedicalAge, Profile } from '../model/profile';

export type Privileges = 'commercial' | 'private' | 'permit';

/** The categories that give each kind of privileges: a Category 1 meets the Category 3 standard too. */
const GIVES: Record<Privileges, readonly Medical[]> = {
  commercial: ['cat1'],
  private: ['cat1', 'cat3'],
  permit: ['cat1', 'cat3', 'cat4'],
};

export const PRIVILEGES_LABEL: Record<Privileges, string> = {
  commercial: 'For commercial privileges (CPL, ATPL)',
  private: 'For private privileges (PPL)',
  permit: 'For a student pilot permit',
};

function months(privileges: Privileges, age: MedicalAge): number {
  if (privileges === 'commercial') return age === 'over60' ? 6 : 12;
  if (privileges === 'private') return age === 'under40' ? 60 : 24;
  return 60;
}

/** The privileges a requirement asks for, from the categories it accepts. */
export const privilegesFor = (anyOf: readonly Medical[]): Privileges => (anyOf.includes('cat4') ? 'permit' : anyOf.includes('cat3') ? 'private' : 'commercial');

/** The last day of the period that starts the month after an exam. */
export function periodEnd(exam: string, privileges: Privileges, age: MedicalAge): string {
  const nextMonth = addMonths(`${exam.slice(0, 7)}-01`, 1);
  return addDays(addMonths(nextMonth, months(privileges, age)), -1);
}

/**
 * The last day the pilot's medical holds for these privileges. Null when its category doesn't give them, or when there's
 * no date to count from: then it can't be checked, and counts (D44).
 */
export function medicalEnd(profile: Profile, privileges: Privileges): string | null {
  if (!GIVES[privileges].includes(profile.medical)) return null;
  if (profile.medicalExam) return periodEnd(profile.medicalExam, privileges, profile.medicalAge);
  return profile.medicalUntil || null;
}

export interface MedicalPeriod {
  privileges: Privileges;
  until: string;
  /** For a reminder (D53): which period it is, and what the email calls it. */
  key: string;
  what: string;
}

/**
 * Every end date the pilot's medical has, longest last. A Category 1 has two: commercial, then private. A "valid to" date
 * from before the exam date was asked for is the only one there is.
 */
export function medicalPeriods(profile: Profile): MedicalPeriod[] {
  if (profile.medical === 'none') return [];
  if (!profile.medicalExam) {
    return profile.medicalUntil ? [{ privileges: profile.medical === 'cat4' ? 'permit' : profile.medical === 'cat1' ? 'commercial' : 'private', until: profile.medicalUntil, key: 'medical', what: 'Your medical certificate' }] : [];
  }
  const own: Privileges[] = profile.medical === 'cat1' ? ['commercial', 'private'] : profile.medical === 'cat3' ? ['private'] : ['permit'];
  return own.map((privileges) => ({
    privileges,
    until: periodEnd(profile.medicalExam, privileges, profile.medicalAge),
    key: privileges === 'commercial' ? 'medical-commercial' : 'medical',
    what: profile.medical !== 'cat1' ? 'Your medical certificate' : privileges === 'commercial' ? 'Your medical for commercial flying' : 'Your medical for private flying',
  }));
}
