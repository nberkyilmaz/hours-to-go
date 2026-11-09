import { useMemo, useRef } from 'react';
import { dateText, formatHours, formatHoursUp, today, type Entry } from '../model/entry';
import type { GoalId, MilestoneRecord, Profile } from '../model/profile';
import type { Logbook } from '../model/store';
import { evaluateGoal, type ExamResult, type GateResult, type GoalResult, type ReqResult } from '../rules/evaluate';
import { GOALS, STANDARD_421_URL, goalById } from '../rules/goals';
import { paceOf, type Pace } from '../rules/pace';
import { CostDetail, CostStat, costOf, openRates } from './Cost';
import { Finish } from './Finish';
import { MedicalFields } from './Medical';
import { NextFlightCard } from './NextFlight';
import { CheckIcon, LockIcon, PlusIcon } from './icons';

type UpdateProfile = (fn: (p: Profile) => Profile) => unknown;

interface Props {
  book: Logbook;
  updateProfile: UpdateProfile;
  onAddHours: () => void;
}

export function ProgressView({ book, updateProfile, onAddHours }: Props) {
  const results = useMemo(() => GOALS.map((g) => evaluateGoal(g, book.entries, book.profile)), [book]);
  const pace = useMemo(() => paceOf(book.entries, today()), [book.entries]);
  const focus = results.find((r) => r.goal.id === book.profile.focus) ?? results[0]!;
  const setFocus = (id: GoalId) => updateProfile((p) => ({ ...p, focus: id }));

  return (
    <div className="stack">
      {book.entries.length === 0 && (
        <div className="callout">
          <div>
            <strong>Start with the hours you already have.</strong>
            <p>Copy the totals from your paper logbook in a few lines, then log each new flight here.</p>
          </div>
          <button type="button" className="btn primary" onClick={onAddHours}>
            <PlusIcon /> Add my hours
          </button>
        </div>
      )}

      <div className="focus-picker">
        <label htmlFor="focus">Working on</label>
        <select id="focus" value={focus.goal.id} onChange={(e) => setFocus(e.target.value as GoalId)}>
          {results.map((r) => (
            <option key={r.goal.id} value={r.goal.id}>
              {r.goal.name}
              {r.held ? ' (held)' : ''}
            </option>
          ))}
        </select>
      </div>

      <GoalDetail result={focus} profile={book.profile} updateProfile={updateProfile} pace={pace} entries={book.entries} />

      <section aria-labelledby="all-goals">
        <h2 id="all-goals" className="section-title">
          Every licence and rating
        </h2>
        <div className="goal-grid">
          {results.map((r) => (
            <GoalCard key={r.goal.id} result={r} active={r.goal.id === focus.goal.id} onSelect={() => setFocus(r.goal.id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function statusText(r: GoalResult): string {
  if (r.held) return r.held.date ? `Held since ${r.held.date}` : 'Held';
  if (r.credited) return 'Covered by a rating you hold';
  if (r.complete) return 'Every requirement met';
  const left = r.minutesToGo > 0 ? ` · at least ${formatHoursUp(r.minutesToGo)} h to go` : '';
  return `${r.done} of ${r.total} done${left}`;
}

function GoalCard({ result: r, active, onSelect }: { result: GoalResult; active: boolean; onSelect: () => void }) {
  const finished = r.held !== null || r.credited !== null || r.complete;
  const pct = finished ? 100 : Math.round((r.done / Math.max(1, r.total)) * 100);
  return (
    <button type="button" className={`goal-card${active ? ' is-active' : ''}${finished ? ' is-done' : ''}`} onClick={onSelect} aria-pressed={active}>
      <span className="goal-card-name">{r.goal.short}</span>
      <span className="goal-card-status">{statusText(r)}</span>
      <span className="bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

interface DetailProps {
  result: GoalResult;
  profile: Profile;
  updateProfile: UpdateProfile;
  pace: Pace | null;
  entries: readonly Entry[];
}

function GoalDetail({ result: r, profile, updateProfile, pace, entries }: DetailProps) {
  const { goal } = r;
  const holding = GOALS.filter((g) => g.id !== goal.id && profile.held[g.id] !== undefined);
  const cost = costOf(r, profile);
  const costPanel = useRef<HTMLDetailsElement>(null);
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
        <div>
          <p className="eyebrow">
            Transport Canada ·{' '}
            <a href={STANDARD_421_URL} target="_blank" rel="noreferrer">
              Standard {goal.cite}
            </a>
          </p>
          <h1 id="goal-title">{goal.name}</h1>
        </div>
        {r.held ? (
          <div className="held-box">
            <label>
              <span>Held since</span>
              <input type="date" value={r.held.date} onChange={(e) => setHeld(e.target.value)} />
            </label>
            <button type="button" className="link" onClick={() => setHeld(null)}>
              Mark as not held
            </button>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setHeld('')}>
            Mark {goal.short} as held
          </button>
        )}
      </header>

      {holding.length > 0 && (
        <p className="holding">
          You hold: {holding.map((g) => g.short).join(' · ')}.{' '}
          <span className="muted">Change this in Profile.</span>
        </p>
      )}

      {r.held || r.credited ? (
        <p className="banner ok">{r.held ? 'You hold this. The requirements are below for reference.' : r.credited}</p>
      ) : (
        <div className={`summary${cost ? ' with-cost' : ''}`}>
          <div className="stat">
            <span className="stat-value">{r.minutesToGo > 0 ? formatHoursUp(r.minutesToGo) : '0'}<small> h</small></span>
            <span className="stat-label">{r.minutesToGo > 0 ? 'of flying left, at least' : 'hours all met'}</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {r.done}<small> / {r.total}</small>
            </span>
            <span className="stat-label">requirements met</span>
          </div>
          {cost && <CostStat result={r} cost={cost} profile={profile} onRates={() => openRates(costPanel.current)} />}
        </div>
      )}
      <Finish result={r} pace={pace} logged={entries.length > 0} />
      {cost && <CostDetail result={r} cost={cost} profile={profile} updateProfile={updateProfile} panel={costPanel} />}
      {'unpriced' in goal.cost && !r.held && !r.credited && <p className="note cost-none">{goal.cost.unpriced}</p>}
      <NextFlightCard result={r} entries={entries} profile={profile} />

      {r.gates.length > 0 && !r.held && (
        <ul className="gates" aria-label="What is unlocked">
          {r.gates.map((g) => (
            <Gate key={g.gate.label} gate={g} />
          ))}
        </ul>
      )}

      {r.scope && <ScopeControl result={r} profile={profile} updateProfile={updateProfile} />}

      {r.sections.map((s) => (
        <div key={s.section.title} className="req-section">
          <h3>{s.section.title}</h3>
          <ul className="reqs">
            {s.results.map((x) => (
              <ReqRow key={x.req.id} r={x} goalId={goal.id} profile={profile} updateProfile={updateProfile} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function shortfall(r: ReqResult): string {
  if (r.req.kind === 'time') return `${r.req.label}: ${formatHoursUp(r.need - r.have)} h to go`;
  if (r.req.kind === 'count') return `${r.req.label}: ${r.need - r.have} to go`;
  return r.req.label;
}

function Gate({ gate: g }: { gate: GateResult }) {
  return (
    <li className={`gate${g.met ? ' is-open' : ''}`}>
      <span className="gate-icon">
        <LockIcon open={g.met} />
      </span>
      <div>
        <strong>{g.gate.label}</strong> <span className="cite">{g.gate.cite}</span>
        {g.passed ? (
          <p>Passed</p>
        ) : g.met ? (
          <p>{g.gate.exams ? 'You can write it' : 'Unlocked'}</p>
        ) : (
          <ul className="gate-open">
            {g.open.map((o) => (
              <li key={o.req.id}>{shortfall(o)}</li>
            ))}
          </ul>
        )}
      </div>
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
      <p>{r.goal.scope?.label}</p>
      {r.scope?.message && <p className="warn-text">{r.scope.message}</p>}
      <label className="inline-field">
        <span>Count training from</span>
        <input type="date" value={override || r.scope?.start || ''} onChange={(e) => setStart(e.target.value)} />
      </label>
      {override && (
        <button type="button" className="link" onClick={() => setStart('')}>
          Use the default
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
}

function ReqRow({ r, goalId, profile, updateProfile }: RowProps) {
  const { req } = r;
  const fieldId = `${goalId}-${req.id}`;
  return (
    <li className={`req${r.met ? ' is-met' : ''}`}>
      <div className="req-line">
        {req.kind === 'milestone' ? (
          <MilestoneCheck r={r} fieldId={fieldId} updateProfile={updateProfile} />
        ) : (
          <span className={`dot${r.met ? ' is-met' : ''}`} aria-hidden="true">
            {r.met && <CheckIcon />}
          </span>
        )}
        <div className="req-body">
          <div className="req-label">
            {req.kind === 'milestone' ? (
              <label htmlFor={fieldId}>{req.label}</label>
            ) : (
              <span>{req.label}</span>
            )}{' '}
            <span className="cite">{req.cite}</span>
            <span className="sr-only">{r.met ? ' (met)' : ' (not met)'}</span>
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
              Mark {goalById(req.anyOf[0]!).short} as held
            </button>
          )}
          {req.kind === 'medical' && <MedicalFields label="Your medical" profile={profile} updateProfile={updateProfile} />}
          {req.kind === 'info' && <p className="info-value">{r.value}</p>}
          {r.credited && <p className="credit">{r.credited}</p>}
          {r.hint && <p className="hint-text">{r.hint}</p>}
          {req.note && <p className="note">{req.note}</p>}
        </div>
      </div>
      {r.children.length > 0 && (
        <ul className="reqs nested">
          {r.children.map((c) => (
            <ReqRow key={c.req.id} r={c} goalId={goalId} profile={profile} updateProfile={updateProfile} />
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
    <div className={`exam-check${exam.ready ? ' is-ready' : ''}`}>
      <p className="exam-check-title">
        {exam.ready ? `You can write the ${exam.name}.` : `Can you write the ${exam.name} yet? Not yet: ${left} ${left === 1 ? 'thing' : 'things'} left.`}
      </p>
      <ul aria-label={`To write the ${exam.name}`}>
        {exam.checks.map((c) => (
          <li key={c.req.id} className={c.met ? 'is-met' : ''}>
            <span className="mini-dot" aria-hidden="true">
              {c.met && <CheckIcon />}
            </span>
            <span>
              {c.req.label} <span className="cite">{c.req.cite}</span>
              <span className="sr-only">{c.met ? ' (done)' : ' (not yet)'}</span>
              {checkDetail(c) && <span className="check-detail"> · {checkDetail(c)}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">On the day, bring government photo ID (421.13(2)).</p>
    </div>
  );
}

const SOON_DAYS = 60;

/** How long a dated item still counts, or that it has run out (D44). */
function Validity({ r }: { r: ReqResult }) {
  if (r.until === null || r.credited !== null) return null;
  const until = dateText(r.until);
  const dated = r.record?.date ? dateText(r.record.date) : '';
  if (r.stale) {
    if (r.req.kind === 'medical') return <p className="hint-text">Your medical ran out on {until}. Renew it for this to count.</p>;
    if (r.req.kind === 'milestone' && r.req.validMonths !== undefined) {
      return <p className="hint-text">Dated {dated}, more than {r.req.validMonths} months ago, so it doesn’t count any more. It has to be done again.</p>;
    }
    return <p className="hint-text">Dated {dated}, more than {r.req.kind === 'milestone' ? r.req.maxAgeDays : 0} days ago, so it can’t be used any more. Ask for a new one.</p>;
  }
  const days = (Date.parse(r.until) - Date.parse(today())) / 86_400_000;
  if (days <= SOON_DAYS) return <p className="note"><span className="warn-text">Runs out on {until}.</span></p>;
  return <p className="note muted">Counts until {until}.</p>;
}

function checkDetail(c: ReqResult): string {
  switch (c.req.kind) {
    case 'time':
      return c.met ? `${formatHours(c.have)} h` : `${formatHours(c.have)} of ${formatHours(c.need)} h, ${formatHoursUp(c.need - c.have)} h to go`;
    case 'medical':
      if (c.stale && c.until) return `ran out on ${dateText(c.until)}`;
      return c.met ? '' : 'set your medical in Profile';
    case 'milestone':
      if (c.credited) return c.credited;
      if (c.stale && c.until) return `ran out on ${dateText(c.until)}`;
      if (c.met) return c.record?.date ? `ticked ${c.record.date}` : 'ticked';
      return 'tick it above when you have it';
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
        {!r.met && left > 0 && <strong> · {isTime ? `${formatHoursUp(left)} h` : left} to go</strong>}
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
function MilestoneCheck({ r, fieldId, updateProfile }: { r: ReqResult; fieldId: string; updateProfile: UpdateProfile }) {
  if (r.req.kind !== 'milestone') return null;
  const { key } = r.req;
  return (
    <span className={`dot check-dot${r.met ? ' is-met' : ''}`}>
      <input
        id={fieldId}
        type="checkbox"
        checked={r.record !== null || r.credited !== null}
        disabled={r.credited !== null}
        onChange={(e) => setMilestone(updateProfile, key, e.target.checked ? { date: today() } : null)}
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
        <span>Date</span>
        <input type="date" value={rec.date} onChange={(e) => set({ ...rec, date: e.target.value })} />
      </label>
      {minScore !== undefined && (
        <label className="inline-field">
          <span>Mark %</span>
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
              set(n === null || Number.isNaN(n) ? rest : { ...rest, score: n });
            }}
          />
        </label>
      )}
      {r.scoreLow && <span className="warn-text">Pass mark is {minScore}%.</span>}
    </div>
  );
}
