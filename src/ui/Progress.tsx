import { useMemo, useRef, useState, type ReactNode } from 'react';
import { dateText, formatHours, formatHoursUp, today, type Entry } from '../model/entry';
import type { GoalId, MilestoneRecord, Profile } from '../model/profile';
import { isSnoozed, snooze, type Logbook } from '../model/store';
import { evaluateGoal, flatten, type ExamResult, type GateResult, type GoalResult, type ReqResult, type SectionResult } from '../rules/evaluate';
import { GOALS, goalById } from '../rules/goals';
import { paceOf, type Pace } from '../rules/pace';
import { progressOf, type GoalProgress } from '../rules/progress';
import { CostDetail, CostStat, costOf, openRates } from './Cost';
import { CurrencyCard } from './Currency';
import { Finish } from './Finish';
import { Ring } from './Ring';
import { Route } from './Route';
import { shareCard, type CardFacts } from './card';
import { MedicalFields } from './Medical';
import { NextFlightCard } from './NextFlight';
import { CheckIcon, LockIcon, PlusIcon } from './icons';
import { STANDARD_CURRENT, STANDARD_URL } from './links';
import { keepUnits } from './text';
import { shortName, t } from '../i18n';

type UpdateProfile = (fn: (p: Profile) => Profile) => unknown;

interface Props {
  book: Logbook;
  updateProfile: UpdateProfile;
  onAddHours: () => void;
  onFly: (line: Partial<Entry>) => void;
  onProfile: () => void;
}

export function ProgressView({ book, updateProfile, onAddHours, onFly, onProfile }: Props) {
  const results = useMemo(
    () => GOALS.map((g) => {
      const now = evaluateGoal(g, book.entries, book.profile);
      return { now, progress: progressOf(now, evaluateGoal(g, [], book.profile)) };
    }),
    [book],
  );
  const pace = useMemo(() => paceOf(book.entries, today()), [book.entries]);
  const focus = results.find((r) => r.now.goal.id === book.profile.focus) ?? results[0]!;
  const [settled, setSettled] = useState(() => isSnoozed('first-step'));
  const setFocus = (id: GoalId) => updateProfile((p) => ({ ...p, focus: id }));

  return (
    <div className="stack">
      {book.entries.length === 0 && !settled && (
        <FirstStep
          profile={book.profile}
          updateProfile={updateProfile}
          onAddHours={onAddHours}
          onDone={() => {
            snooze('first-step');
            setSettled(true);
          }}
        />
      )}

      <CurrencyCard entries={book.entries} profile={book.profile} updateProfile={updateProfile} />

      <GoalDetail
        result={focus.now}
        progress={focus.progress}
        profile={book.profile}
        updateProfile={updateProfile}
        pace={pace}
        entries={book.entries}
        onFly={onFly}
        onProfile={onProfile}
        picker={
          <div className="goal-pick">
            <label htmlFor="focus">{t('Working on')}</label>
            <select id="focus" value={focus.now.goal.id} onChange={(e) => setFocus(e.target.value as GoalId)}>
              {results.map(({ now, progress }) => (
                <option key={now.goal.id} value={now.goal.id}>
                  {t(now.goal.name)}
                  {now.held ? t(' (held)') : now === focus.now ? '' : ` · ${t('{n}%', { n: progress.percent })}`}
                </option>
              ))}
            </select>
          </div>
        }
      />
    </div>
  );
}

interface DetailProps {
  result: GoalResult;
  progress: GoalProgress;
  profile: Profile;
  updateProfile: UpdateProfile;
  pace: Pace | null;
  entries: readonly Entry[];
  picker: ReactNode;
  onFly: (line: Partial<Entry>) => void;
  onProfile: () => void;
}

/**
 * The first thing an empty logbook asks: where the pilot is. Everyone otherwise opens as a student
 * starting a PPL, and a licensed pilot has to discover Profile to say otherwise.
 */
function FirstStep({ profile, updateProfile, onAddHours, onDone }: { profile: Profile; updateProfile: UpdateProfile; onAddHours: () => void; onDone: () => void }) {
  const [licensed, setLicensed] = useState(false);
  const toggle = (id: GoalId, on: boolean) =>
    updateProfile((p) => {
      const held = { ...p.held };
      if (on) held[id] = { date: '' };
      else delete held[id];
      // On to the first thing not held yet.
      return { ...p, held, focus: GOALS.find((g) => held[g.id] === undefined)?.id ?? p.focus };
    });
  return (
    <div className="callout first-step">
      <div>
        <strong>{t('Start with the hours you already have.')}</strong>
        <p>{t('Copy the totals from your paper logbook in a few lines, then log each new flight here.')}</p>
      </div>
      <button type="button" className="btn primary" onClick={onAddHours}>
        <PlusIcon />{' '}{t('Add my hours')}
      </button>
      <div className="first-step-more">
        <button type="button" className="link" onClick={onDone}>
          {t('I’m just starting')}
        </button>
        <button type="button" className="link" aria-expanded={licensed} onClick={() => setLicensed(!licensed)}>
          {t('I already hold a licence')}
        </button>
      </div>
      {licensed && (
        <fieldset className="first-step-held">
          <legend>{t('Tick what you hold')}</legend>
          {GOALS.map((g) => (
            <label key={g.id} className="toggle">
              <input type="checkbox" checked={profile.held[g.id] !== undefined} onChange={(e) => toggle(g.id, e.target.checked)} />
              <span>{t(g.name)}</span>
            </label>
          ))}
          <button type="button" className="btn small" onClick={onDone}>
            {t('Done')}
          </button>
        </fieldset>
      )}
    </div>
  );
}

/** The hours are what a student comes to see; the standard's own order is prerequisites first. */
const hoursFirst = (sections: readonly SectionResult[]) => [...sections.filter((s) => s.section.kind === 'experience'), ...sections.filter((s) => s.section.kind !== 'experience')];

/** Nothing left to do in it. An info row is a figure to read, not something to finish. */
const isDone = (r: ReqResult): boolean => r.req.kind !== 'info' && r.met && r.children.every(isDone);

/** What the card says about a goal: held, finished, or how far along. Null with nothing to show yet. */
function factsOf(r: GoalResult, progress: GoalProgress): CardFacts | null {
  const goal = shortName(r.goal.short);
  if (r.held) return { headline: t('I earned my {goal}', { goal }), detail: r.held.date ? dateText(r.held.date) : t(r.goal.name), percent: null };
  if (r.complete) return { headline: t('Every {goal} requirement met', { goal }), detail: dateText(today()), percent: 100 };
  if (r.credited || progress.percent === 0) return null;
  return {
    headline: t('On the way to my {goal}', { goal }),
    detail: t('{have} of {need} h', { have: formatHours(progress.flown), need: formatHours(progress.need) }),
    percent: progress.percent,
  };
}

function ShareProgress({ result, progress }: { result: GoalResult; progress: GoalProgress }) {
  const [failed, setFailed] = useState(false);
  const facts = factsOf(result, progress);
  if (!facts) return null;
  return (
    <p className="share-progress">
      <button
        type="button"
        className="link"
        onClick={() => {
          setFailed(false);
          shareCard(facts).catch(() => setFailed(true));
        }}
      >
        {t('Share my progress')}
      </button>
      {failed && (
        <span className="field-error" role="alert">
          {' '}
          {t('Couldn’t make the picture.')}
        </span>
      )}
    </p>
  );
}

function GoalDetail({ result: r, progress, profile, updateProfile, pace, entries, picker, onFly, onProfile }: DetailProps) {
  const { goal } = r;
  const holding = GOALS.filter((g) => g.id !== goal.id && profile.held[g.id] !== undefined);
  const cost = costOf(r, profile);
  const costPanel = useRef<HTMLDetailsElement>(null);
  // What was ticked just now stays in place, with its date and mark still to fill in.
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const pin = (id: string) => setPinned((p) => new Set(p).add(id));
  // Held, the requirements are for reference, so they all stay.
  const showAll = r.held !== null || r.credited !== null;
  const stays = (x: ReqResult) => showAll || !isDone(x) || pinned.has(x.req.id);
  const finished = showAll ? [] : flatten(r.sections.flatMap((s) => s.results)).filter((x) => x.req.kind !== 'info' && x.met && !pinned.has(x.req.id));
  const setHeld = (date: string | null) =>
    updateProfile((p) => {
      const held = { ...p.held };
      if (date === null) delete held[goal.id];
      else held[goal.id] = { date };
      return { ...p, held };
    });

  return (
    <section className="card goal" aria-labelledby="goal-title">
      <header className="goal-head">
        <div className="goal-title">
          {picker}
          <h1 id="goal-title" className="sr-only">
            {t(goal.name)}
          </h1>
          <p className="eyebrow">
            {t('Transport Canada ·')}{' '}
            <a href={STANDARD_URL} target="_blank" rel="noreferrer">
              {t('Standard')}{' '}{goal.cite}
            </a>{' '}
            {t('· current to')}{' '}{STANDARD_CURRENT}{t(', checked nightly')}
          </p>
        </div>
        {r.held && (
          <div className="held-box">
            <label>
              <span>{t('Held since')}</span>
              <input type="date" value={r.held.date} onChange={(e) => setHeld(e.target.value)} />
            </label>
            <button type="button" className="link" onClick={() => setHeld(null)}>
              {t('Mark as not held')}
            </button>
          </div>
        )}
      </header>

      {holding.length > 0 && (
        <p className="holding">
          {t('You hold:')}{' '}{holding.map((g) => shortName(g.short)).join(' · ')}.{' '}
          <button type="button" className="link" onClick={onProfile}>
            {t('Change this in Profile.')}
          </button>
        </p>
      )}

      {r.held || r.credited ? (
        <p className="banner ok">{r.held ? t('You hold this. The requirements are below for reference.') : t(r.credited ?? '')}</p>
      ) : (
        <div className="hero">
          <Ring percent={progress.percent} />
          <div className="hero-hours">
            {progress.need > 0 && (
              <span className="hero-figure">
                {formatHours(progress.flown)}
                <small>{' '}{t('of')}{' '}{formatHours(progress.need)}{' '}{t('h')}</small>
              </span>
            )}
            <span className="stat-label">{progress.left > 0 ? t('at least {hours} h to go', { hours: formatHoursUp(progress.left) }) : progress.need > 0 ? t('All hours flown') : t('No minimum hours')}</span>
            <span className="stat-label">
              {r.done}{' '}{t('of')}{' '}{r.total}{' '}{t('requirements met')}
            </span>
          </div>
          {cost && <CostStat result={r} cost={cost} profile={profile} onRates={() => openRates(costPanel.current)} />}
        </div>
      )}
      <Route result={r} />
      <ShareProgress result={r} progress={progress} />
      {r.complete && !r.held && !r.credited && (
        <div className="banner ok goal-complete">
          <span>
            <strong>{t('Every')}{' '}{shortName(goal.short)}{' '}{t('requirement is met.')}</strong>{' '}{t('Time to send in your application.')}
          </span>
          <button type="button" className="btn primary small" onClick={() => setHeld('')}>
            {t('Mark')}{' '}{shortName(goal.short)}{' '}{t('as held')}
          </button>
        </div>
      )}
      <Finish result={r} pace={pace} logged={entries.length > 0} cost={cost} />
      {cost && <CostDetail result={r} cost={cost} profile={profile} updateProfile={updateProfile} panel={costPanel} />}
      {'unpriced' in goal.cost && !r.held && !r.credited && <p className="note cost-none">{t(goal.cost.unpriced)}</p>}
      <NextFlightCard result={r} entries={entries} profile={profile} onFly={onFly} />

      {r.gates.length > 0 && !r.held && (
        <ul className="gates" aria-label={t('What is unlocked')}>
          {r.gates.map((g) => (
            <Gate key={g.gate.label} gate={g} />
          ))}
        </ul>
      )}

      {r.scope && <ScopeControl result={r} profile={profile} updateProfile={updateProfile} />}

      {(showAll ? r.sections : hoursFirst(r.sections)).map((s) => {
        const open = s.results.filter(stays);
        if (open.length === 0) return null;
        return (
          <div key={s.section.title} className="req-section">
            <h2>{t(s.section.title)}</h2>
            <ul className="reqs">
              {open.map((x) => (
                <ReqRow key={x.req.id} r={x} goalId={goal.id} profile={profile} updateProfile={updateProfile} stays={stays} pin={pin} />
              ))}
            </ul>
          </div>
        );
      })}
      {finished.length > 0 && (
        <details className="req-done">
          <summary>{t('Done (')}{finished.length})</summary>
          <ul className="reqs">
            {finished.map((x) => (
              <ReqRow key={x.req.id} r={{ ...x, children: [] }} goalId={goal.id} profile={profile} updateProfile={updateProfile} stays={() => false} pin={pin} />
            ))}
          </ul>
        </details>
      )}
      {!r.held && !r.complete && (
        <button type="button" className="link goal-held" onClick={() => setHeld('')}>
          {t('Mark')}{' '}{shortName(goal.short)}{' '}{t('as held')}
        </button>
      )}
    </section>
  );
}

function shortfall(r: ReqResult): string {
  if (r.req.kind === 'time') return keepUnits(t('{label}: {value}', { label: t(r.req.label), value: t('{hours} h to go', { hours: formatHoursUp(r.need - r.have) }) }));
  if (r.req.kind === 'count') return t('{label}: {value}', { label: t(r.req.label), value: t('{amount} to go', { amount: r.need - r.have }) });
  return keepUnits(t(r.req.label));
}

function Gate({ gate: g }: { gate: GateResult }) {
  const open = g.open.length;
  const status = g.passed ? t('Passed') : g.met ? (g.gate.exams ? t('You can write it') : t('Unlocked')) : open === 1 ? t('1 thing left') : t('{n} things left', { n: open });
  const title = (
    <>
      <strong>{t(g.gate.label)}</strong>
      <span className="gate-status">{status}</span>
    </>
  );
  return (
    <li className={`gate${g.met ? ' is-open' : ''}`}>
      <span className="gate-icon">
        <LockIcon open={g.met} />
      </span>
      {g.met || g.passed ? (
        <div className="gate-line">{title}</div>
      ) : (
        <details className="gate-more">
          <summary className="gate-line">{title}</summary>
          <p className="cite">{g.gate.cite}</p>
          <ul className="gate-open">
            {g.open.map((o) => (
              <li key={o.req.id}>{shortfall(o)}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function ScopeControl({ result: r, profile, updateProfile }: { result: GoalResult; profile: Profile; updateProfile: UpdateProfile }) {
  const id = r.goal.id;
  const override = profile.trainingStart[id] ?? '';
  const setStart = (date: string) =>
    updateProfile((p) => {
      const trainingStart = { ...p.trainingStart };
      if (date) trainingStart[id] = date;
      else delete trainingStart[id];
      return { ...p, trainingStart };
    });
  return (
    <div className="scope">
      <p>{r.goal.scope && t(r.goal.scope.label)}</p>
      {r.scope?.message && <p className="warn-text">{r.scope.message}</p>}
      <label className="inline-field">
        <span>{t('Count training from')}</span>
        <input type="date" value={override || r.scope?.start || ''} onChange={(e) => setStart(e.target.value)} />
      </label>
      {override && (
        <button type="button" className="link" onClick={() => setStart('')}>
          {t('Use the default')}
        </button>
      )}
    </div>
  );
}

interface RowProps {
  r: ReqResult;
  goalId: GoalId;
  profile: Profile;
  updateProfile: UpdateProfile;
  /** Whether a sub-requirement stays in this list. */
  stays: (r: ReqResult) => boolean;
  pin: (id: string) => void;
}

function ReqRow({ r, goalId, profile, updateProfile, stays, pin }: RowProps) {
  const { req } = r;
  const fieldId = `${goalId}-${req.id}`;
  return (
    <li className={`req${r.met ? ' is-met' : ''}`}>
      <div className="req-line">
        {req.kind === 'milestone' ? (
          <MilestoneCheck r={r} fieldId={fieldId} updateProfile={updateProfile} pin={pin} />
        ) : (
          <span className={`dot${r.met ? ' is-met' : ''}`} aria-hidden="true">
            {r.met && <CheckIcon />}
          </span>
        )}
        <div className="req-body">
          <div className="req-label">
            {req.kind === 'milestone' ? (
              <label htmlFor={fieldId}>{keepUnits(t(req.label))}</label>
            ) : (
              <span>{keepUnits(t(req.label))}</span>
            )}{' '}
            <span className="cite">{req.cite}</span>
            <span className="sr-only">{r.met ? t(' (met)') : t(' (not met)')}</span>
          </div>
          {(req.kind === 'time' || req.kind === 'count') && <Meter r={r} />}
          {req.kind === 'milestone' && <MilestoneControls r={r} updateProfile={updateProfile} />}
          <Validity r={r} />
          {r.exam && !r.exam.passed && <ExamPanel exam={r.exam} />}
          {req.kind === 'held' && r.met && <p className="credit">{r.value}</p>}
          {req.kind === 'held' && !r.met && (
            <button
              type="button"
              className="link"
              onClick={() => updateProfile((p) => ({ ...p, held: { ...p.held, [req.anyOf[0]!]: { date: '' } } }))}
            >
              {t('Mark')}{' '}{shortName(goalById(req.anyOf[0]!).short)}{' '}{t('as held')}
            </button>
          )}
          {req.kind === 'medical' && <MedicalFields label={t('Your medical')} profile={profile} updateProfile={updateProfile} />}
          {req.kind === 'info' && <p className="info-value">{r.value}</p>}
          {r.credited && <p className="credit">{t(r.credited)}</p>}
          {r.hint && <p className="hint-text">{r.hint}</p>}
          {req.note && (
            <p className="note">
              {req.reading && <span className="reading">{t('Our reading. Ask your school.')}</span>} {keepUnits(t(req.note))}
            </p>
          )}
        </div>
      </div>
      {r.children.some(stays) && (
        <ul className="reqs nested">
          {r.children.filter(stays).map((c) => (
            <ReqRow key={c.req.id} r={c} goalId={goalId} profile={profile} updateProfile={updateProfile} stays={stays} pin={pin} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Whether Transport Canada would let you sit a written exam yet (421.13). */
function ExamPanel({ exam }: { exam: ExamResult }) {
  const left = exam.checks.filter((c) => !c.met).length;
  return (
    <details className={`exam-check${exam.ready ? ' is-ready' : ''}`}>
      <summary className="exam-check-title">
        {exam.ready ? t('You can write the {exam}.', { exam: exam.name }) : left === 1 ? t('Can you write the {exam} yet? Not yet: 1 thing left.', { exam: exam.name }) : t('Can you write the {exam} yet? Not yet: {n} things left.', { exam: exam.name, n: left })}
      </summary>
      <ul aria-label={t('To write the {exam}', { exam: exam.name })}>
        {exam.checks.map((c) => (
          <li key={c.req.id} className={c.met ? 'is-met' : ''}>
            <span className="mini-dot" aria-hidden="true">
              {c.met && <CheckIcon />}
            </span>
            <span>
              {t(c.req.label)} <span className="cite">{c.req.cite}</span>
              <span className="sr-only">{c.met ? t(' (done)') : t(' (not yet)')}</span>
              {checkDetail(c) && <span className="check-detail"> · {checkDetail(c)}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">{t('On the day, bring government photo ID (421.13(2)).')}</p>
    </details>
  );
}

const SOON_DAYS = 60;

/** How long a dated item still counts, or that it has run out (D44). */
function Validity({ r }: { r: ReqResult }) {
  if (r.until === null || r.credited !== null) return null;
  const until = dateText(r.until);
  const dated = r.record?.date ? dateText(r.record.date) : '';
  if (r.stale) {
    if (r.req.kind === 'medical') return <p className="hint-text">{t('Your medical ran out on')}{' '}{until}{t('. Renew it for this to count.')}</p>;
    if (r.req.kind === 'milestone' && r.req.validMonths !== undefined) {
      return <p className="hint-text">{t('Dated')}{' '}{dated}{t(', more than')}{' '}{r.req.validMonths}{' '}{t('months ago, so it doesn’t count any more. It has to be done again.')}</p>;
    }
    return <p className="hint-text">{t('Dated')}{' '}{dated}{t(', more than')}{' '}{r.req.kind === 'milestone' ? r.req.maxAgeDays : 0}{' '}{t('days ago, so it can’t be used any more. Ask for a new one.')}</p>;
  }
  const days = (Date.parse(r.until) - Date.parse(today())) / 86_400_000;
  if (days <= SOON_DAYS) return <p className="note"><span className="warn-text">{t('Runs out on')}{' '}{until}.</span></p>;
  return <p className="note muted">{t('Counts until')}{' '}{until}.</p>;
}

function checkDetail(c: ReqResult): string {
  switch (c.req.kind) {
    case 'time':
      return c.met ? `${formatHours(c.have)} h` : t('{have} of {need} h, {left} h to go', { have: formatHours(c.have), need: formatHours(c.need), left: formatHoursUp(c.need - c.have) });
    case 'medical':
      if (c.stale && c.until) return t('ran out on {date}', { date: dateText(c.until) });
      return c.met ? '' : t('set your medical in Profile');
    case 'milestone':
      if (c.credited) return t(c.credited);
      if (c.stale && c.until) return t('ran out on {date}', { date: dateText(c.until) });
      if (c.met) return c.record?.date ? t('ticked {date}', { date: c.record.date }) : t('ticked');
      return t('tick it above when you have it');
    default:
      return '';
  }
}

function Meter({ r }: { r: ReqResult }) {
  const isTime = r.req.kind === 'time';
  const show = (n: number) => (isTime ? formatHours(n) : String(n));
  const pct = Math.min(100, Math.round((r.have / Math.max(1, r.need)) * 100));
  const left = r.need - r.have;
  return (
    <div className="meter">
      <span className="bar" aria-hidden="true">
        <span style={{ width: `${r.met ? 100 : pct}%` }} />
      </span>
      <span className="meter-figures">
        {show(r.have)} / {show(r.need)}
        {isTime ? ' h' : ''}
        {!r.met && left > 0 && <strong> · {isTime ? `${formatHoursUp(left)} h` : left}{' '}{t('to go')}</strong>}
      </span>
    </div>
  );
}

function setMilestone(updateProfile: UpdateProfile, key: string, next: MilestoneRecord | null) {
  return updateProfile((p) => {
    const milestones = { ...p.milestones };
    if (next) milestones[key] = next;
    else delete milestones[key];
    return { ...p, milestones };
  });
}

/** The status dot doubles as the checkbox for things the log can't show. */
function MilestoneCheck({ r, fieldId, updateProfile, pin }: { r: ReqResult; fieldId: string; updateProfile: UpdateProfile; pin: (id: string) => void }) {
  if (r.req.kind !== 'milestone') return null;
  const { key } = r.req;
  return (
    <span className={`dot check-dot${r.met ? ' is-met' : ''}`}>
      <input
        id={fieldId}
        type="checkbox"
        checked={r.record !== null || r.credited !== null}
        disabled={r.credited !== null}
        onChange={(e) => {
          pin(r.req.id);
          setMilestone(updateProfile, key, e.target.checked ? { date: today() } : null);
        }}
      />
      {r.met && <CheckIcon />}
    </span>
  );
}

function MilestoneControls({ r, updateProfile }: { r: ReqResult; updateProfile: UpdateProfile }) {
  if (r.req.kind !== 'milestone' || r.record === null) return null;
  const { key, minScore } = r.req;
  const rec = r.record;
  const set = (next: MilestoneRecord) => setMilestone(updateProfile, key, next);
  return (
    <div className="milestone">
      <label className="inline-field">
        <span>{t('Date')}</span>
        <input type="date" value={rec.date} onChange={(e) => set({ ...rec, date: e.target.value })} />
      </label>
      {minScore !== undefined && (
        <label className="inline-field">
          <span>{t('Mark %')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            className="score"
            value={rec.score ?? ''}
            onChange={(e) => {
              const { score: _old, ...rest } = rec;
              const n = e.target.value === '' ? null : Number(e.target.value);
              set(n === null || Number.isNaN(n) ? rest : { ...rest, score: Math.min(100, Math.max(0, n)) });
            }}
          />
        </label>
      )}
      {r.scoreLow && <span className="warn-text">{t('Pass mark is')}{' '}{t('{n}%', { n: minScore! })}.</span>}
      {minScore !== undefined && rec.score === undefined && <span className="hint">{t('Enter your overall mark so the app can check it.')}</span>}
    </div>
  );
}
