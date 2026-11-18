export const GOAL_IDS = ['ppl', 'night', 'vfrott', 'cpl', 'multi', 'ifr3', 'ifr1', 'inst4', 'atpl'] as const;
export type GoalId = (typeof GOAL_IDS)[number];

export type Medical = 'none' | 'cat4' | 'cat3' | 'cat1';

export const MEDICAL_LABEL: Record<Medical, string> = {
  none: 'None yet',
  cat4: 'Category 4',
  cat3: 'Category 3',
  cat1: 'Category 1',
};

/**
 * The pilot's age on the day of the medical exam. It sets how long the certificate lasts (CAR 404.04(6), (6.2)), and is
 * all the app needs to know about age: no birth date.
 */
export type MedicalAge = 'under40' | 'over40' | 'over60';

export const MEDICAL_AGE_LABEL: Record<MedicalAge, string> = {
  under40: 'Under 40',
  over40: '40 to 59',
  over60: '60 or older',
};

/**
 * One line from the paper logbook with its takeoffs and landings. They're already in the paper totals; only their date
 * is new, because carrying passengers needs 5 in the last 6 months (CAR 401.05(2)(b)) and totals can't show when.
 */
export interface RecentLandings {
  date: string;
  day: number;
  night: number;
  /** In a multi-engine aeroplane: a different class, counted apart. */
  multi: boolean;
}

/** A one-off item that hours cannot show: an exam, a ground school, a special flight, a flight test. */
export interface MilestoneRecord {
  date: string;
  /** Exam mark in percent, when the milestone is an exam. */
  score?: number;
}

/** What the pilot's school charges, for the cost to go. Dollars an hour; tax in percent. */
export interface Rates {
  /** The training aeroplane, with fuel and any fuel surcharge. */
  aircraft: number;
  instructor: number;
  /** A simulator hour, without the instructor. Null when the pilot won't use one. */
  sim: number | null;
  /** What the school adds on top, e.g. 13 for Ontario's HST. */
  tax: number;
}

/**
 * Used until the pilot enters their school's own (D39). $220 is what Waterloo Wellington Flight
 * Centre charges for a C172 in 2026, inside the $195–$259 other Ontario clubs ask; instructors are
 * $80–$95 an hour across schools; 13% is Ontario's HST.
 */
export const SAMPLE_RATES: Rates = { aircraft: 220, instructor: 90, sim: null, tax: 13 };

export interface Profile {
  medical: Medical;
  /** The date of the medical exam, as the certificate shows it; empty until entered. The end dates are worked out from it (D70). */
  medicalExam: string;
  medicalAge: MedicalAge;
  /**
   * A "valid to" date entered before the app worked it out (D44). Used only while there is no exam date, so nobody's
   * medical stops counting the day this changed.
   */
  medicalUntil: string;
  /** Takeoffs and landings inside the paper totals, with their dates, for carrying passengers. Newest first. */
  landings: RecentLandings[];
  /** Licences and ratings already held. The date may be blank when the pilot does not have it handy. */
  held: Partial<Record<GoalId, { date: string }>>;
  milestones: Record<string, MilestoneRecord>;
  /** Overrides where a goal's training window starts (e.g. CPL training since the PPL). */
  trainingStart: Partial<Record<GoalId, string>>;
  /** The licence or rating the pilot is working on now. */
  focus: GoalId;
  /** The school's rates; null until entered, and the sample rates are shown. */
  rates: Rates | null;
}

export function blankProfile(): Profile {
  return { medical: 'none', medicalExam: '', medicalAge: 'under40', medicalUntil: '', landings: [], held: {}, milestones: {}, trainingStart: {}, focus: 'ppl', rates: null };
}
