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

export interface Profile {
  medical: Medical;
  /** Licences and ratings already held. The date may be blank when the pilot does not have it handy. */
  held: Partial<Record<GoalId, { date: string }>>;
  milestones: Record<string, MilestoneRecord>;
  /** Overrides where a goal's training window starts (e.g. CPL training since the PPL). */
  trainingStart: Partial<Record<GoalId, string>>;
  /** The licence or rating the pilot is working on now. */
  focus: GoalId;
}

export function blankProfile(): Profile {
  return { medical: 'none', held: {}, milestones: {}, trainingStart: {}, focus: 'ppl' };
}
