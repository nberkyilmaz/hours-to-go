/**
 * Transport Canada licence and rating requirements, aeroplane category.
 *
 * Source: CAR Standard 421 — Flight Crew Permits, Licences and Ratings, as
 * published on tc.canada.ca (text current to NSA 2025-008, effective
 * 2025-12-17). Every requirement carries the paragraph it comes from so a
 * pilot can check it against the standard.
 *
 * Where the standard leaves room for interpretation, the choice made here is
 * written in the requirement's note so it is visible in the app rather than
 * buried in code.
 */
import { derive, type Derived, type Entry } from '../model/entry';
import type { GoalId, Medical, Profile } from '../model/profile';

export const STANDARD_421_URL =
  'https://tc.canada.ca/en/corporate-services/acts-regulations/list-regulations/canadian-aviation-regulations-sor-96-433/standards/standard-421-flight-crew-permits-licences-ratings-canadian-aviation-regulations-cars';

export interface Ctx {
  /** Every entry in the log. */
  all: readonly Entry[];
  /** Entries inside the goal's training window (e.g. CPL training since the PPL was issued). */
  scoped: readonly Entry[];
  profile: Profile;
  /** YYYY-MM-DD; recommendation letters expire after 60 days. */
  today: string;
}

interface Base {
  id: string;
  label: string;
  /** Paragraph of Standard 421 the requirement comes from. */
  cite: string;
  note?: string;
  /** Returns the reason when a credit in the standard satisfies the requirement. */
  credit?: (c: Ctx) => string | null;
  /** While unmet, points at time in the log that may belong here but isn't counted. */
  hint?: (c: Ctx) => string | null;
  /** Requirements the standard nests under this one ("…including…"). */
  sub?: Req[];
}

/** Hours. `have` returns minutes. */
export interface TimeReq extends Base {
  kind: 'time';
  need: number;
  have: (c: Ctx) => number;
}

export interface CountReq extends Base {
  kind: 'count';
  need: number;
  have: (c: Ctx) => number;
}

/** Something the log cannot show — an exam, ground school, a particular flight, a flight test. */
export interface MilestoneReq extends Base {
  kind: 'milestone';
  /** Shared across goals: passing INRAT once satisfies Group 3, Group 1 and the ATPL. */
  key: string;
  minScore?: number;
  /** Stops counting this many days after its date (a recommendation letter). */
  maxAgeDays?: number;
}

export interface HeldReq extends Base {
  kind: 'held';
  anyOf: GoalId[];
}

export interface MedicalReq extends Base {
  kind: 'medical';
  anyOf: Medical[];
}

/** A figure worth showing that the standard sets no minimum for. */
export interface InfoReq extends Base {
  kind: 'info';
  value: (c: Ctx) => string;
}

export type Req = TimeReq | CountReq | MilestoneReq | HeldReq | MedicalReq | InfoReq;

export type SectionKind = 'prerequisites' | 'knowledge' | 'experience' | 'skill';

export interface Section {
  kind: SectionKind;
  title: string;
  /** Counts only entries inside the goal's training window. */
  scoped?: boolean;
  reqs: Req[];
}

/** A step that unlocks before the licence itself: writing the exam, booking the flight test. */
export interface Gate {
  label: string;
  cite: string;
  needs: Req[] | 'knowledge-and-experience';
  /** The written exams this gate leads to; once they're passed the gate says so. */
  exams?: string[];
}

export interface Goal {
  id: GoalId;
  name: string;
  short: string;
  cite: string;
  /** Where training that only counts inside a window starts. */
  scope?: { from: 'ppl' | 'manual'; label: string };
  /** The whole goal is satisfied by something already held. */
  credit?: (c: Ctx) => string | null;
  sections: Section[];
  gates: Gate[];
}

// ---------------------------------------------------------------------------
// Sums over the log. All in minutes.

/** Adds up one figure over a set of lines: minutes, or a tally for landings. */
const sum = (entries: readonly Entry[], key: keyof Derived) => entries.reduce((t, e) => t + derive(e)[key], 0);

// The paper log keeps solo inside PIC, so PIC time flown alone but not yet
// marked as solo is easy to miss. These say how much of it there is.
const notTicked = (minutes: number, what: string) =>
  minutes > 0 ? `${fmt(minutes)} of ${what} in your log isn’t counted as solo. If you flew it alone, edit that line in the Logbook and say so.` : null;
const soloHint = (scope: 'all' | 'scoped') => (c: Ctx) => notTicked(sum(c[scope], 'pic') - sum(c[scope], 'solo'), 'PIC time');
const soloNightHint = (scope: 'all' | 'scoped') => (c: Ctx) => notTicked(sum(c[scope], 'picNight') - sum(c[scope], 'soloNight'), 'PIC night time');
const soloXcHint = (c: Ctx) => notTicked(sum(c.all, 'xcPic') - sum(c.all, 'soloXc'), 'PIC cross-country');
const soloLandingsHint = (scope: 'all' | 'scoped') => (c: Ctx) => {
  // Only lines with PIC night time could hold solo night landings.
  const open = c[scope].reduce((t, e) => t + (derive(e).picNight > 0 ? e.nightLandings - derive(e).soloNightLandings : 0), 0);
  return open > 0
    ? `${open} night takeoffs & landings on lines with PIC night time aren’t counted as solo. Edit that line in the Logbook and say how many were solo.`
    : null;
};

const upTo = (minutes: number, hours: number) => Math.min(minutes, hours * 60);
const fmt = (minutes: number) => `${(minutes / 60).toFixed(1)} h`;

// ---------------------------------------------------------------------------
// Builders.

type Extra = Omit<Partial<Base>, 'id' | 'label' | 'cite'>;

const time = (id: string, label: string, need: number, have: (c: Ctx) => number, cite: string, extra: Extra = {}): TimeReq => ({
  kind: 'time', id, label, need, have, cite, ...extra,
});

const count = (id: string, label: string, need: number, have: (c: Ctx) => number, cite: string, extra: Extra = {}): CountReq => ({
  kind: 'count', id, label, need, have, cite, ...extra,
});

const milestone = (key: string, label: string, cite: string, extra: Extra & { minScore?: number; maxAgeDays?: number } = {}): MilestoneReq => ({
  kind: 'milestone', id: key, key, label, cite, ...extra,
});

const held = (anyOf: GoalId[], label: string, cite: string, extra: Extra = {}): HeldReq => ({
  kind: 'held', id: `held-${anyOf.join('-')}`, anyOf, label, cite, ...extra,
});

const medical = (anyOf: Medical[], label: string, cite: string): MedicalReq => ({
  kind: 'medical', id: `medical-${anyOf.join('-')}`, anyOf, label, cite,
});

const holds = (c: Ctx, ...ids: GoalId[]) => ids.some((id) => c.profile.held[id] !== undefined);

const PILOT_LICENCE: GoalId[] = ['ppl', 'cpl', 'atpl'];

// ---------------------------------------------------------------------------
// Writing a written exam, 421.13. Transport Canada checks a medical, for some
// exams a recommendation letter, and a share of the experience before it lets
// you sit the exam. The same check shows under the exam on every page it's on.

export interface ExamCheck {
  /** The exam's milestone key. */
  key: string;
  name: string;
  minScore: number;
  needs: Req[];
}

/** An exam ticked off with a passing mark (or no mark entered). */
export function passed(c: Pick<Ctx, 'profile'>, key: string, minScore: number): boolean {
  const rec = c.profile.milestones[key];
  return rec !== undefined && (rec.score === undefined || rec.score >= minScore);
}

const letter = (key: string, from: string, exam: string, minScore: number, cite: string) =>
  milestone(key, `Letter of recommendation from ${from}, to write the ${exam}`, cite, {
    maxAgeDays: 60,
    note: 'It says you’ve finished ground school and are ready to write. It must be dated within the 60 days before the exam and can only be used once.',
    credit: (c) => (passed(c, `exam-${exam.toLowerCase()}`, minScore) ? `Used for the ${exam} you’ve passed.` : null),
  });

const LETTER_PPAER = letter('letter-ppaer', 'your flight school or instructor', 'PPAER', 60, '421.13(3)(a)');
const LETTER_CPAER = letter('letter-cpaer', 'your flight school or instructor', 'CPAER', 60, '421.13(3)(a)');
const LETTER_AIRAF = letter('letter-airaf', 'your ground school instructor', 'AIRAF', 70, '421.13(3)(b)');

const atplExam = (key: string, name: string): ExamCheck => ({
  key,
  name,
  minScore: 70,
  needs: [
    medical(['cat1'], 'Category 1 medical', '421.13(1)'),
    time('write-atpl-time', '375 h flight time (25% of 1500 h)', 375, (c) => sum(c.all, 'total'), '421.13(4)(f)'),
  ],
});

const EXAM_CHECKS: Record<string, ExamCheck> = {
  'exam-ppaer': {
    key: 'exam-ppaer',
    name: 'PPAER',
    minScore: 60,
    needs: [
      medical(['cat3', 'cat1'], 'Category 3 or 1 medical', '421.13(1)'),
      milestone('ground-ppl', '40 h private pilot ground school', '421.13(3)(a)'),
      LETTER_PPAER,
      time('write-ppaer-time', '5 h flight time', 5, (c) => sum(c.all, 'total'), '421.13(4)(a)'),
    ],
  },
  'exam-cpaer': {
    key: 'exam-cpaer',
    name: 'CPAER',
    minScore: 60,
    needs: [
      medical(['cat1'], 'Category 1 medical', '421.13(1)'),
      milestone('ground-cpl', '80 h commercial pilot ground school', '421.13(3)(a)'),
      LETTER_CPAER,
      time('write-cpaer-time', '50 h flight time (25% of 200 h)', 50, (c) => sum(c.all, 'total'), '421.13(4)(f)'),
    ],
  },
  'exam-inrat': {
    key: 'exam-inrat',
    name: 'INRAT',
    minScore: 70,
    needs: [
      medical(['cat3', 'cat1'], 'Category 3 or 1 medical', '421.13(1)'),
      time('write-inrat-time', '5 h instrument flight or ground time', 5, (c) => sum(c.all, 'inst') + sum(c.all, 'ftd'), '421.13(4)(d)'),
    ],
  },
  'exam-samra': atplExam('exam-samra', 'SAMRA'),
  'exam-saron': atplExam('exam-saron', 'SARON'),
  'exam-airaf': {
    key: 'exam-airaf',
    name: 'AIRAF',
    minScore: 70,
    needs: [
      medical(['cat1'], 'Category 1 medical', '421.13(1)'),
      milestone('ground-inst4', '25 h instructor ground school', '421.13(4)(b)'),
      LETTER_AIRAF,
      time('write-airaf-time', '7.5 h instructor flight training (25% of 30 h)', 7.5, (c) => instructorTraining(c), '421.13(4)(b)'),
    ],
  },
};

/** What Transport Canada needs before you may write this exam, or undefined if it isn't a written exam. */
export const examCheck = (key: string): ExamCheck | undefined => EXAM_CHECKS[key];

const writeGate = (label: string, ...keys: string[]): Gate => ({
  label,
  cite: '421.13',
  needs: EXAM_CHECKS[keys[0]!]!.needs,
  exams: keys,
});

// ---------------------------------------------------------------------------
// Private Pilot Licence — Aeroplane, 421.26

const pplTraining = (c: Ctx) => sum(c.all, 'dual') + sum(c.all, 'solo') + upTo(sum(c.all, 'ftd'), 5);

const ppl: Goal = {
  id: 'ppl',
  name: 'Private Pilot Licence — Aeroplane',
  short: 'PPL',
  cite: '421.26',
  sections: [
    {
      kind: 'prerequisites',
      title: 'Prerequisites',
      reqs: [medical(['cat3', 'cat1'], 'Category 3 medical (or Category 1)', '421.26(2)')],
    },
    {
      kind: 'knowledge',
      title: 'Knowledge',
      reqs: [
        milestone('ground-ppl', '40 h private pilot ground school', '421.26(3)(a)'),
        LETTER_PPAER,
        milestone('exam-ppaer', 'PPAER written exam: 60% overall and in each of the four subjects', '421.26(3)(b)', { minScore: 60 }),
      ],
    },
    {
      kind: 'experience',
      title: 'Experience',
      reqs: [
        time('ppl-training', '45 h private pilot flight training', 45, pplTraining, '421.26(4)(a)', {
          note: 'Dual and solo time. Up to 5 h of FTD time counts.',
        }),
        time('ppl-dual', '17 h dual instruction', 17, (c) => sum(c.all, 'dual'), '421.26(4)(b)(i)', {
          sub: [
            time('ppl-dual-xc', '3 h dual cross-country', 3, (c) => sum(c.all, 'xcDual'), '421.26(4)(b)(i)'),
            time('ppl-dual-inst', '5 h instrument time, up to 3 h of it on the ground', 5,
              (c) => sum(c.all, 'dualInst') + upTo(sum(c.all, 'ftd'), 3), '421.26(4)(b)(i)'),
          ],
        }),
        time('ppl-solo', '12 h solo', 12, (c) => sum(c.all, 'solo'), '421.26(4)(b)(ii)', {
          hint: soloHint('all'),
          sub: [
            time('ppl-solo-xc', '5 h solo cross-country', 5, (c) => sum(c.all, 'soloXc'), '421.26(4)(b)(ii)', { hint: soloXcHint }),
            milestone('xc-ppl-150', 'Solo cross-country of at least 150 NM with full-stop landings at 2 points other than the departure point', '421.26(4)(b)(ii)'),
          ],
        }),
      ],
    },
    {
      kind: 'skill',
      title: 'Skill',
      reqs: [milestone('test-ppl', 'PPL flight test, within the 12 months before you apply', '421.26(5)')],
    },
  ],
  gates: [
    writeGate('Write the PPAER', 'exam-ppaer'),
    { label: 'Take the flight test', cite: '421.14(4)(a)', needs: [time('gate-ppl-test', '35 of the 45 h of flight training', 35, pplTraining, '421.14(4)(a)')] },
  ],
};

// ---------------------------------------------------------------------------
// Night Rating — Aeroplane, 421.42(1)

const night: Goal = {
  id: 'night',
  name: 'Night Rating — Aeroplane',
  short: 'Night',
  cite: '421.42(1)',
  sections: [
    { kind: 'prerequisites', title: 'Prerequisites', reqs: [held(PILOT_LICENCE, 'Pilot licence — aeroplane', '421.42(1)')] },
    {
      kind: 'experience',
      title: 'Experience',
      reqs: [
        time('night-night', '10 h night flight time', 10, (c) => sum(c.all, 'night'), '421.42(1)(a)(i)', {
          sub: [
            time('night-dual', '5 h dual at night', 5, (c) => sum(c.all, 'dualNight'), '421.42(1)(a)(i)(A)', {
              sub: [time('night-dual-xc', '2 h dual cross-country at night', 2, (c) => sum(c.all, 'xcNightDual'), '421.42(1)(a)(i)(A)')],
            }),
            time('night-solo', '5 h solo at night', 5, (c) => sum(c.all, 'soloNight'), '421.42(1)(a)(i)(B)', {
              hint: soloNightHint('all'),
              sub: [count('night-solo-ldg', '10 solo night takeoffs, circuits and landings', 10, (c) => sum(c.all, 'soloNightLandings'), '421.42(1)(a)(i)(B)', { hint: soloLandingsHint('all') })],
            }),
          ],
        }),
        time('night-inst', '10 h dual instrument time, up to 5 h of it on the ground', 10,
          (c) => sum(c.all, 'dualInst') + upTo(sum(c.all, 'ftd'), 5), '421.42(1)(a)(ii)–(iii)', {
            note: 'Must be on top of the 10 night hours: hood time flown at night can’t count toward both. This counts every dual instrument hour in your log, including PPL training.',
          }),
      ],
    },
    {
      kind: 'skill',
      title: 'Skill',
      reqs: [milestone('test-night', 'Qualifying flight with a TC inspector or qualified instructor', '421.42(1)(b)')],
    },
  ],
  gates: [],
};

// ---------------------------------------------------------------------------
// VFR Over-the-Top Rating, 421.44

const vfrott: Goal = {
  id: 'vfrott',
  name: 'VFR Over-the-Top Rating',
  short: 'VFR OTT',
  cite: '421.44',
  credit: (c) => (holds(c, 'ifr3', 'ifr1') ? 'Your instrument rating meets every VFR OTT requirement. It is issued on request (421.44(5)).' : null),
  sections: [
    { kind: 'prerequisites', title: 'Prerequisites', reqs: [held(PILOT_LICENCE, 'Pilot licence — aeroplane', '421.44')] },
    { kind: 'knowledge', title: 'Knowledge', reqs: [milestone('ground-vfrott', 'Knowledge to the Flight Instructor Standard — VFR OTT', '421.44(2)')] },
    {
      kind: 'experience',
      title: 'Experience',
      reqs: [
        time('vfrott-inst', '15 h dual instrument time, up to 5 h of it on the ground', 15,
          (c) => sum(c.all, 'dualInst') + upTo(sum(c.all, 'ftd'), 5), '421.44(3)', {
            note: 'Counts every dual instrument hour in your log. Training is to the VFR OTT standard, so ask your FTU which earlier hours they credit.',
          }),
      ],
    },
    { kind: 'skill', title: 'Skill', reqs: [milestone('test-vfrott', 'Skill to the Flight Instructor Standard — VFR OTT', '421.44(4)')] },
  ],
  gates: [],
};

// ---------------------------------------------------------------------------
// Commercial Pilot Licence — Aeroplane, 421.30

const nightRatingCredit = (c: Ctx) =>
  holds(c, 'night')
    ? 'Met by your night rating, as long as the 35 h dual and 30 h solo are done (421.30(7)(b)(vi)(A)).'
    : null;

const cpl: Goal = {
  id: 'cpl',
  name: 'Commercial Pilot Licence — Aeroplane',
  short: 'CPL',
  cite: '421.30',
  scope: { from: 'ppl', label: 'Commercial flight training counts from the day your PPL was issued.' },
  sections: [
    {
      kind: 'prerequisites',
      title: 'Prerequisites',
      reqs: [
        held(['ppl'], 'Private Pilot Licence — Aeroplane', '421.30(4)(a)(ii)'),
        medical(['cat1'], 'Category 1 medical', '421.30(2)'),
      ],
    },
    {
      kind: 'knowledge',
      title: 'Knowledge',
      reqs: [
        milestone('ground-cpl', '80 h commercial pilot ground school', '421.30(3)(a)'),
        LETTER_CPAER,
        milestone('exam-cpaer', 'CPAER written exam: 60% overall and in each of the four subjects', '421.30(3)(c)', { minScore: 60 }),
      ],
    },
    {
      kind: 'experience',
      title: 'Total experience',
      reqs: [
        time('cpl-total', '200 h flight time', 200, (c) => sum(c.all, 'total'), '421.30(4)(a)(i)'),
        time('cpl-pic', '100 h pilot-in-command', 100, (c) => sum(c.all, 'pic'), '421.30(4)(a)(i)', {
          sub: [time('cpl-pic-xc', '20 h PIC cross-country', 20, (c) => sum(c.all, 'xcPic'), '421.30(4)(a)(i)')],
        }),
      ],
    },
    {
      kind: 'experience',
      title: 'Commercial flight training since your PPL (65 h)',
      scoped: true,
      reqs: [
        time('cpl-dual', '35 h dual instruction', 35, (c) => sum(c.scoped, 'dual'), '421.30(4)(a)(ii)(A)', {
          sub: [
            time('cpl-dual-night', '5 h dual at night', 5, (c) => sum(c.scoped, 'dualNight'), '421.30(4)(a)(ii)(A)(I)', {
              credit: nightRatingCredit,
              sub: [time('cpl-dual-night-xc', '2 h dual cross-country at night', 2, (c) => sum(c.scoped, 'xcNightDual'), '421.30(4)(a)(ii)(A)(I)', { credit: nightRatingCredit })],
            }),
            time('cpl-dual-xc', '5 h dual cross-country', 5, (c) => sum(c.scoped, 'xcDual'), '421.30(4)(a)(ii)(A)(II)', {
              note: 'May include the night cross-country above.',
            }),
            time('cpl-dual-inst', '20 h dual instrument time, up to 10 h of it in a simulator', 20,
              (c) => sum(c.scoped, 'dualInst') + upTo(sum(c.scoped, 'ftd'), 10), '421.30(4)(a)(ii)(A)(III)', {
                note: 'On top of the night and cross-country time above.',
                credit: (c) => (holds(c, 'ifr3', 'ifr1') ? 'Met by your instrument rating (421.30(7)(c)).' : null),
              }),
          ],
        }),
        time('cpl-solo', '30 h solo', 30, (c) => sum(c.scoped, 'solo'), '421.30(4)(a)(ii)(B)', {
          hint: soloHint('scoped'),
          note: 'Solo means you were the only person on board.',
          sub: [
            milestone('xc-cpl-300', 'Solo cross-country of at least 300 NM with full-stop landings at 3 aerodromes other than the departure, one of them at least 250 NM straight-line from it', '421.30(4)(a)(ii)(B)(I)'),
            time('cpl-solo-night', '5 h solo at night', 5, (c) => sum(c.scoped, 'soloNight'), '421.30(4)(a)(ii)(B)(II)', {
              hint: soloNightHint('scoped'),
              credit: nightRatingCredit,
              sub: [count('cpl-solo-night-ldg', '10 solo night takeoffs, circuits and landings', 10, (c) => sum(c.scoped, 'soloNightLandings'), '421.30(4)(a)(ii)(B)(II)', { credit: nightRatingCredit, hint: soloLandingsHint('scoped') })],
            }),
          ],
        }),
      ],
    },
    {
      kind: 'skill',
      title: 'Skill',
      reqs: [milestone('test-cpl', 'CPL flight test, within the 12 months before you apply', '421.30(5)(a)', {
        note: 'Without the night time the licence is restricted to day flying (421.30(6)).',
      })],
    },
  ],
  gates: [
    writeGate('Write the CPAER', 'exam-cpaer'),
    {
      label: 'Take the flight test',
      cite: '421.14(3)(b), (4)(c)',
      needs: [
        time('gate-cpl-test', '150 h flight time (75% of 200 h)', 150, (c) => sum(c.all, 'total'), '421.14(4)(c)'),
        milestone('exam-cpaer', 'CPAER passed', '421.14(3)(b)', { minScore: 60 }),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Multi-engine Class Rating, 421.38(3)

const multiEngine: Goal = {
  id: 'multi',
  name: 'Multi-engine Class Rating — Aeroplane',
  short: 'Multi-engine',
  cite: '421.38(3)',
  sections: [
    { kind: 'prerequisites', title: 'Prerequisites', reqs: [held(PILOT_LICENCE, 'Pilot licence — aeroplane', '421.38')] },
    {
      kind: 'experience',
      title: 'Experience',
      reqs: [{
        kind: 'info',
        id: 'multi-time',
        label: 'Multi-engine time in your log',
        cite: '421.38(3)',
        note: 'TC sets no minimum hours for this rating; your school’s syllabus does.',
        value: (c) => fmt(sum(c.all, 'multi')),
      }],
    },
    { kind: 'skill', title: 'Skill', reqs: [milestone('test-multi', 'Multi-engine class rating flight test', '421.38(3)(a)')] },
  ],
  gates: [],
};

// ---------------------------------------------------------------------------
// Instrument Rating, 421.46. Groups differ only in the aeroplane flown on the test.

function instrument(group: 1 | 3): Goal {
  return {
    id: group === 1 ? 'ifr1' : 'ifr3',
    name: `Instrument Rating — Group ${group}`,
    short: `IFR Group ${group}`,
    cite: '421.46',
    sections: [
      {
        kind: 'prerequisites',
        title: 'Prerequisites',
        reqs: [
          held(PILOT_LICENCE, 'Pilot licence — aeroplane', '421.46'),
          ...(group === 1
            ? [held(['multi'], 'Multi-engine class rating', '421.46(1)(a)', { note: 'The Group 1 flight test is flown in a multi-engine aeroplane.' })]
            : []),
        ],
      },
      {
        kind: 'knowledge',
        title: 'Knowledge',
        reqs: [milestone('exam-inrat', 'INRAT written exam: 70% or better', '421.46(2)(a)', { minScore: 70 })],
      },
      {
        kind: 'experience',
        title: 'Experience',
        reqs: [
          time('ifr-pic-xc', '50 h cross-country as pilot-in-command', 50, (c) => sum(c.all, 'xcPic'), '421.46(2)(b)(i)', {
            note: 'Only PIC time counts (solo, or in command with others aboard). Dual cross-country does not.',
          }),
          time('ifr-inst', '40 h instrument time, up to 20 h of it on the ground', 40,
            (c) => sum(c.all, 'inst') + upTo(sum(c.all, 'ftd'), 20), '421.46(2)(b)(ii)', {
              sub: [
                time('ifr-dual-inst', '15 h dual instrument flight time, at least 5 h with a flight instructor', 15,
                  (c) => sum(c.all, 'dualInst'), '421.46(2)(b)(ii)(A), (C)', {
                    note: 'Counted in the aeroplane only. FTD time already counts above as ground time; ask your FTU whether they also credit FTD dual here.',
                  }),
                milestone('xc-ifr-100', 'Dual cross-country of at least 100 NM in actual or simulated IMC, on an IFR flight plan, with an approach to minima at 2 different places', '421.46(2)(b)(ii)(D)'),
              ],
            }),
        ],
      },
      {
        kind: 'skill',
        title: 'Skill',
        reqs: [milestone(`test-ifr${group}`, `Instrument rating flight test in a ${group === 1 ? 'multi-engine' : 'single-engine'} aeroplane`, '421.46(2)(c)')],
      },
    ],
    gates: [
      writeGate('Write the INRAT', 'exam-inrat'),
      { label: 'Take the flight test', cite: '421.14(4)(d)', needs: 'knowledge-and-experience' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Flight Instructor Rating — Class 4 Aeroplane, 421.69

const instructorTraining = (c: Ctx) => sum(c.scoped, 'dual') + upTo(sum(c.scoped, 'ftd'), 5);

const instructor4: Goal = {
  id: 'inst4',
  name: 'Flight Instructor Rating — Class 4',
  short: 'Class 4',
  cite: '421.69',
  scope: { from: 'manual', label: 'Instructor flight training counts from the day your instructor course started.' },
  sections: [
    {
      kind: 'prerequisites',
      title: 'Before instructor flight training',
      reqs: [
        held(['cpl', 'atpl'], 'Commercial or Airline Transport Pilot Licence', '421.69(1)(a)'),
        time('i4-total', '200 h flight time', 200, (c) => sum(c.all, 'total'), '421.69(1)(a)(i)', {
          sub: [
            time('i4-inst', '20 h instrument time', 20, (c) => sum(c.all, 'inst') + sum(c.all, 'ftd'), '421.69(1)(a)(i)', {
              sub: [time('i4-inst-flight', '10 h instrument flight time', 10, (c) => sum(c.all, 'inst'), '421.69(1)(a)(i)')],
            }),
          ],
        }),
      ],
    },
    {
      kind: 'knowledge',
      title: 'Knowledge',
      reqs: [
        milestone('ground-inst4', '25 h instructor ground school, started after passing the CPL exam and flight test', '421.69(1)(b), (2)(a)'),
        LETTER_AIRAF,
        milestone('exam-airaf', 'AIRAF written exam: 70% or better', '421.69(2)(b)', { minScore: 70 }),
      ],
    },
    {
      kind: 'experience',
      title: 'Instructor flight training',
      scoped: true,
      reqs: [
        time('i4-dual', '30 h dual instruction, up to 5 h of it in a simulator', 30, instructorTraining, '421.69(3)', {
          sub: [milestone('i4-teach-inst', '5 h training in teaching instrument flight skills', '421.69(3)')],
        }),
      ],
    },
    { kind: 'skill', title: 'Skill', reqs: [milestone('test-inst4', 'Class 4 instructor flight test', '421.69(4)')] },
  ],
  gates: [
    writeGate('Write the AIRAF', 'exam-airaf'),
    { label: 'Take the flight test', cite: '421.14(4)(d)', needs: 'knowledge-and-experience' },
  ],
};

// ---------------------------------------------------------------------------
// Airline Transport Pilot Licence — Aeroplane, 421.34

const atpl: Goal = {
  id: 'atpl',
  name: 'Airline Transport Pilot Licence — Aeroplane',
  short: 'ATPL',
  cite: '421.34',
  sections: [
    {
      kind: 'prerequisites',
      title: 'Prerequisites',
      reqs: [
        held(['cpl'], 'Commercial Pilot Licence — Aeroplane, not restricted to day flying', '421.34(4)'),
        medical(['cat1'], 'Category 1 medical', '421.34(2)'),
      ],
    },
    {
      kind: 'knowledge',
      title: 'Knowledge',
      reqs: [
        milestone('exam-samra', 'SAMRA written exam: 70% or better', '421.34(3)(a)', { minScore: 70 }),
        milestone('exam-saron', 'SARON written exam: 70% or better', '421.34(3)(b)', { minScore: 70 }),
        milestone('exam-inrat', 'INRAT written exam: 70% or better', '421.34(3)(c)', { minScore: 70 }),
      ],
    },
    {
      kind: 'experience',
      title: 'Experience',
      reqs: [
        time('atpl-total', '1500 h flight time', 1500, (c) => sum(c.all, 'total'), '421.34(4)', {
          note: 'Simulator time does not count toward the 1500 h.',
        }),
        time('atpl-pic', '250 h pilot-in-command', 250, (c) => sum(c.all, 'pic'), '421.34(4)(a)', {
          note: 'Up to 100 h of PIC under supervision can count. This app does not track that yet.',
          sub: [
            time('atpl-pic-xc', '100 h PIC cross-country', 100, (c) => sum(c.all, 'xcPic'), '421.34(4)(a)', {
              sub: [time('atpl-pic-xc-night', '25 h PIC cross-country at night', 25, (c) => sum(c.all, 'xcNightPic'), '421.34(4)(a)')],
            }),
          ],
        }),
        time('atpl-night', '100 h night as PIC or co-pilot', 100, (c) => sum(c.all, 'picNight') + sum(c.all, 'copilotNight'), '421.34(4)(b)'),
        time('atpl-xc-more', '100 more h cross-country as PIC', 100,
          (c) => Math.max(0, sum(c.all, 'xcPic') - 100 * 60), '421.34(4)(c)', {
            note: 'On top of the 100 h PIC cross-country above. The standard also accepts co-pilot cross-country (200 h as co-pilot, or a mix), but the Canadian personal log has no co-pilot cross-country column, so only PIC is counted.',
          }),
        time('atpl-inst', '75 h instrument time, up to 25 h of it on the ground', 75,
          (c) => sum(c.all, 'inst') + upTo(sum(c.all, 'ftd'), 25), '421.34(4)(d)'),
      ],
    },
    {
      kind: 'skill',
      title: 'Skill',
      reqs: [milestone('test-atpl', 'Flight test to the Group 1 instrument standard in a two-crew multi-engine aeroplane, or an IFR PPC', '421.34(5)')],
    },
  ],
  gates: [
    writeGate('Write SAMRA and SARON', 'exam-samra', 'exam-saron'),
    { label: 'Take the flight test', cite: '421.14(4)(c)', needs: [time('gate-atpl-test', '1125 h flight time (75% of 1500 h)', 1125, (c) => sum(c.all, 'total'), '421.14(4)(c)')] },
  ],
};

export const GOALS: readonly Goal[] = [ppl, night, vfrott, cpl, multiEngine, instrument(3), instrument(1), instructor4, atpl];

export function goalById(id: GoalId): Goal {
  const g = GOALS.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown goal ${id}`);
  return g;
}
