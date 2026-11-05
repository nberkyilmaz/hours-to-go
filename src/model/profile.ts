export const GOAL_IDS = ['ppl', 'night', 'vfrott', 'cpl', 'multi', 'ifr3', 'ifr1', 'inst4', 'atpl'] as const;
export type GoalId = (typeof GOAL_IDS)[number];

export type Medical = 'none' | 'cat4' | 'cat3' | 'cat1';

export const MEDICAL_LABEL: Record<Medical, string> = {
  none: 'None yet',
  cat4: 'Category 4',
  cat3: 'Category 3',
  cat1: 'Category 1',
};

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
  return { medical: 'none', held: {}, milestones: {}, trainingStart: {}, focus: 'ppl', rates: null };
}
