import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AFTER_PPL_FIELDS,
  AFTER_PPL_LABEL,
  COLUMN_LABEL,
  COUNT_COLUMNS,
  FLIGHT_COLUMNS,
  LOG_GROUPS,
  TIME_COLUMNS,
  asksSoloNightLandings,
  blankBreakdown,
  derive,
  doubtsAbout,
  durationText,
  formatHours,
  isTimeColumn,
  parseDuration,
  today,
  validateEntry,
  type AfterPplField,
  type Answer,
  type Column,
  type ColumnGroup,
  type Entry,
  type EntryErrors,
} from '../model/entry';
import { blankQuick, quickFrom, quickText, type Quick, type QuickKind } from '../model/quick';

/** Which boxes the form shows. The line underneath is the same in every case. */
export type FormLayout = 'flight' | 'ftd' | 'forward';

export interface Suggestions {
  aircraft: string[];
  registrations: string[];
  places: string[];
}

interface Props {
  initial: Entry;
  isNew: boolean;
  layout: FormLayout;
  suggestions: Suggestions;
  /** The PPL issue date: '' when held but undated, undefined when no PPL is held. */
  pplDate: string | undefined;
  /** Resolves true once saved; the form stays open otherwise. */
  onSave: (entry: Entry) => Promise<true | null>;
  onClose: () => void;
  /** Only for a line already logged. */
  onDelete?: (() => void) | undefined;
}

type ColumnText = Record<Column, string>;
type SoloText = Record<'soloDay' | 'soloNight' | 'soloXc', string>;
type AfterText = Record<AfterPplField, string>;

const countText = (n: number) => (n ? String(n) : '');

function columnText(e: Entry): ColumnText {
  const t = {} as ColumnText;
  for (const c of TIME_COLUMNS) t[c] = durationText(e[c]);
  for (const c of COUNT_COLUMNS) t[c] = countText(e[c]);
  return t;
}

const group = (title: string): ColumnGroup => LOG_GROUPS.find((g) => g.title === title)!;
const SINGLE = [group('Single-engine day'), group('Single-engine night')];
const MULTI = [group('Multi-engine day'), group('Multi-engine night')];
const XC = [group('Cross-country day'), group('Cross-country night')];
const INSTRUMENT = group('Instrument');
const LANDINGS = group('Takeoffs & landings');
const FTD_ONLY: ColumnGroup = { title: 'FTD session', columns: ['ftd', 'approaches'] };

const KINDS: { kind: QuickKind; label: string }[] = [
  { kind: 'dual', label: 'Dual, with an instructor' },
  { kind: 'solo', label: 'Solo' },
  { kind: 'pic', label: 'PIC, with passengers' },
];

const TITLE: Record<FormLayout, { add: string; edit: string; thing: string }> = {
  flight: { add: 'Log a flight', edit: 'Edit flight', thing: 'flight' },
  ftd: { add: 'Log an FTD session', edit: 'Edit FTD session', thing: 'session' },
  forward: { add: 'Totals from your paper logbook', edit: 'Totals from your paper logbook', thing: 'entry' },
};

/** Reads a box; null when it isn't a number of the right kind. */
const readCount = (s: string) => (s.trim() === '' ? 0 : /^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

export function EntryForm({ initial, isNew, layout, suggestions, pplDate, onSave, onClose, onDelete }: Props) {
  const legacy = initial.forward && !initial.breakdown;
  const b0 = initial.breakdown ?? blankBreakdown();
  const [entry, setEntry] = useState<Entry>(initial);
  // Null is the paper columns: a flight that doesn't fit the quick form opens there.
  const [quick, setQuick] = useState<Quick | null>(() => (layout !== 'flight' ? null : isNew ? blankQuick() : quickFrom(initial)));
  const [showWhere, setShowWhere] = useState(!initial.aircraft && !initial.registration);
  const [text, setText] = useState<ColumnText>(() => ({ ...columnText(initial), ...(quick && isNew ? quickText(quick) : {}) }));
  const [soloAnswer, setSoloAnswer] = useState<Answer | null>(legacy ? (initial.solo ? 'all' : null) : b0.solo);
  const [soloText, setSoloText] = useState<SoloText>({
    soloDay: durationText(b0.soloDay),
    soloNight: durationText(b0.soloNight),
    soloXc: durationText(b0.soloXc),
  });
  const [soloLandings, setSoloLandings] = useState(() => countText(initial.soloNightLandings));
  const [afterAnswer, setAfterAnswer] = useState<Answer | null>(b0.afterPpl);
  const [afterText, setAfterText] = useState<AfterText>(() => {
    const t = {} as AfterText;
    for (const f of AFTER_PPL_FIELDS) t[f] = f === 'soloNightLandings' ? countText(b0.after[f]) : durationText(b0.after[f]);
    return t;
  });
  const [errors, setErrors] = useState<EntryErrors>({});
  const [saving, setSaving] = useState(false);
  const [showMulti, setShowMulti] = useState(() => MULTI.some((g) => g.columns.some((c) => initial[c] > 0)));
  // What the last Save asked about, so that saving again means "yes, keep it".
  const [doubts, setDoubts] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  // Counts the failed saves, so each one takes the pilot to what's wrong.
  const [tried, setTried] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLFormElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const inHistory = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  const typed = JSON.stringify({ entry, text, soloAnswer, soloText, soloLandings, afterAnswer, afterText });
  const [opened] = useState(typed);
  const changed = useRef(false);
  changed.current = typed !== opened;

  /** Leaves the form, and takes the history entry that lets Back close it with it. */
  const leave = () => {
    if (inHistory.current) {
      inHistory.current = false;
      window.history.back();
    }
    onClose();
  };
  /** Cancel, Esc, the backdrop or Back: nothing typed goes without asking. */
  const tryClose = () => {
    if (changed.current) setAsking(true);
    else leave();
  };

  // A native modal: focus stays in it and the page behind is inert. Focus goes to the sheet, not a
  // box, because a box would raise a phone's keyboard or date wheel before anything is chosen.
  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    // The quick form starts at the time, the one thing that's always needed.
    (d.querySelector<HTMLElement>('#q-time') ?? sheet.current)?.focus();
  }, []);

  // A phone's keyboard covers the screen without resizing it, so the sheet follows what's still
  // visible, and Save stays above the keys.
  useEffect(() => {
    const view = window.visualViewport;
    const d = dialog.current;
    if (!view || !d) return;
    const fit = () => {
      d.style.setProperty('--sheet-height', `${view.height}px`);
      d.style.setProperty('--sheet-top', `${view.offsetTop}px`);
    };
    fit();
    view.addEventListener('resize', fit);
    view.addEventListener('scroll', fit);
    return () => {
      view.removeEventListener('resize', fit);
      view.removeEventListener('scroll', fit);
    };
  }, []);

  // After the modal has gone: until then the page behind it can't take focus.
  useEffect(() => () => opener.current?.focus(), []);

  // On a phone Back is the natural way out, and without this it would leave the app with the flight.
  useEffect(() => {
    if (!inHistory.current) {
      window.history.pushState({ sheet: true }, '');
      inHistory.current = true;
    }
    const onBack = () => {
      if (!inHistory.current) return;
      inHistory.current = false;
      if (changed.current) {
        window.history.pushState({ sheet: true }, '');
        inHistory.current = true;
        setAsking(true);
      } else {
        onClose();
      }
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, [onClose]);

  // A failed save goes to the first thing wrong; the message can be well below the fold.
  useEffect(() => {
    if (tried === 0) return;
    const wrong = body.current?.querySelector<HTMLElement>('.field-error, .has-error');
    if (!wrong) return;
    wrong.scrollIntoView?.({ block: 'center' });
    const scope = wrong.closest('fieldset, .field, .form-section');
    const box = scope?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? scope?.querySelector<HTMLElement>('input, select, textarea');
    box?.focus({ preventScroll: true });
  }, [tried]);

  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setEntry((e) => ({ ...e, [k]: v }));
  const setColumn = (c: Column, v: string) => setText((t) => ({ ...t, [c]: v }));
  const changeQuick = (next: Partial<Quick>) => {
    if (!quick) return;
    const q = { ...quick, ...next };
    setQuick(q);
    setText((t) => ({ ...t, ...quickText(q) }));
    setEntry((e) => ({ ...e, solo: q.kind === 'solo' }));
  };
  const forward = layout === 'forward';
  const ftd = layout === 'ftd';

  /** The line as the boxes stand, and the boxes that don't hold a number. */
  const build = (): { line: Entry; bad: EntryErrors } => {
    const line: Entry = { ...entry };
    const bad: EntryErrors = {};
    for (const c of TIME_COLUMNS) {
      const m = parseDuration(text[c]);
      if (m === null) bad[c] = 'Hours, like 1.3 or 1:18.';
      line[c] = m ?? 0;
    }
    for (const c of COUNT_COLUMNS) {
      const n = readCount(text[c]);
      if (n === null) bad[c] = 'A whole number.';
      line[c] = n ?? 0;
    }
    const landings = readCount(soloLandings);
    if (landings === null) bad.soloNightLandings = 'A whole number.';
    line.soloNightLandings = landings ?? 0;
    if (!forward) {
      line.breakdown = null;
      return { line, bad };
    }
    const b = blankBreakdown();
    b.solo = soloAnswer;
    if (soloAnswer === 'some') {
      for (const k of ['soloDay', 'soloNight', 'soloXc'] as const) {
        const m = parseDuration(soloText[k]);
        if (m === null) bad[k] = 'Hours, like 1.3 or 1:18.';
        b[k] = m ?? 0;
      }
    }
    b.afterPpl = afterAnswer;
    if (afterAnswer === 'some') {
      for (const f of AFTER_PPL_FIELDS) {
        const n = f === 'soloNightLandings' ? readCount(afterText[f]) : parseDuration(afterText[f]);
        if (n === null) bad[`after.${f}`] = f === 'soloNightLandings' ? 'A whole number.' : 'Hours, like 1.3 or 1:18.';
        b.after[f] = n ?? 0;
      }
    }
    line.solo = false;
    line.breakdown = b;
    return { line, bad };
  };

  const { line: preview } = build();
  const d = derive(preview);
  const askSolo = forward && d.pic > 0;
  const askLandings = asksSoloNightLandings(preview);
  const askAfterPpl = forward && pplDate !== undefined && (pplDate === '' || entry.date >= pplDate) && d.total + preview.ftd > 0;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const { line, bad } = build();
    if (forward && line.breakdown) {
      // A question that doesn't apply to these totals has no answer to keep.
      if (!askSolo) line.breakdown.solo = null;
      if (!askAfterPpl) line.breakdown.afterPpl = null;
    }
    if (!askLandings) line.soloNightLandings = 0;
    const errs: EntryErrors = { ...bad };
    if (askSolo && !soloAnswer) errs.soloAnswer = 'Pick one, so the solo requirements count the right time.';
    if (askLandings && soloLandings.trim() === '') errs.soloNightLandings = 'Enter how many were solo (0 if none).';
    if (askAfterPpl && !afterAnswer) errs.afterAnswer = 'Pick one, so the CPL counts only what came after your PPL.';
    if (quick && !quick.kind) errs.time = 'Choose Dual, Solo or PIC, and enter the time.';
    const all = { ...validateEntry(line), ...errs };
    setErrors(all);
    if (Object.keys(all).length > 0) {
      if (MULTI.some((g) => g.columns.some((c) => all[c]))) setShowMulti(true);
      // Anything else wrong is in a box the quick form doesn't show.
      if (Object.keys(all).some((k) => !['time', 'hood', 'date'].includes(k))) setQuick(null);
      if (all.date) setShowWhere(true);
      setTried((n) => n + 1);
      return;
    }
    const found = doubtsAbout(line, today());
    if (found.join() !== doubts.join()) {
      setDoubts(found);
      if (found.length > 0) return;
    }
    setSaving(true);
    const ok = await onSave(line);
    setSaving(false);
    if (ok) leave();
  };

  const groupInputs = (g: ColumnGroup) => <ColumnInputs key={g.title} group={g} text={text} errors={errors} onChange={setColumn} />;

  const landingsQuestion = askLandings && (
    <Field id="f-solo-ldg" label={`How many of the ${preview.nightLandings} night takeoffs & landings were solo?`} error={errors.soloNightLandings}>
      <input
        id="f-solo-ldg"
        className="narrow"
        inputMode="numeric"
        placeholder="0"
        autoComplete="off"
        value={soloLandings}
        onChange={(e) => setSoloLandings(e.target.value)}
        aria-invalid={errors.soloNightLandings ? true : undefined}
        aria-describedby={errors.soloNightLandings ? 'f-solo-ldg-err' : undefined}
      />
      <p className="hint">The paper log doesn’t say which were yours alone. The night rating and the CPL each need 10 solo.</p>
    </Field>
  );

  const problems = Object.keys(errors).length;
  const stillDoubtful = doubts.length > 0 && doubts.join() === doubtsAbout(preview, today()).join();
  const timeError = errors.time && <p className="field-error">{errors.time}</p>;

  const whereFields = (
    <>
      <div className="grid-2">
        <Field id="f-date" label={forward ? 'Up to (date)' : 'Date'} error={errors.date}>
          <input
            id="f-date"
            type="date"
            value={entry.date}
            onChange={(e) => set('date', e.target.value)}
            required
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? 'f-date-err' : undefined}
          />
        </Field>
        <Field id="f-aircraft" label={ftd ? 'Device' : forward ? 'Aircraft type (blank for all types)' : 'Aircraft type'}>
          <input
            id="f-aircraft"
            list="dl-aircraft"
            placeholder={ftd ? 'e.g. Redbird FMX' : 'e.g. C172, PA-28'}
            autoComplete="off"
            value={entry.aircraft}
            onChange={(e) => set('aircraft', e.target.value)}
          />
        </Field>
      </div>
      {layout === 'flight' && (
        <div className="grid-3">
          <Field id="f-reg" label="Registration">
            <input
              id="f-reg"
              list="dl-reg"
              autoComplete="off"
              autoCapitalize="characters"
              value={entry.registration}
              onChange={(e) => set('registration', e.target.value.toUpperCase())}
            />
          </Field>
          <Field id="f-from" label="From">
            <input id="f-from" list="dl-place" autoComplete="off" autoCapitalize="characters" value={entry.from} onChange={(e) => set('from', e.target.value.toUpperCase())} />
          </Field>
          <Field id="f-to" label="To">
            <input id="f-to" list="dl-place" autoComplete="off" autoCapitalize="characters" value={entry.to} onChange={(e) => set('to', e.target.value.toUpperCase())} />
          </Field>
        </div>
      )}
    </>
  );

  const route = entry.from || entry.to ? `${entry.from || '—'} → ${entry.to || '—'}` : '';
  const where = [entry.date === today() ? 'Today' : entry.date, [entry.aircraft, entry.registration].filter(Boolean).join(' '), route].filter(Boolean).join(' · ');

  const remarks = (
    <Field id="f-remarks" label="Remarks">
      <textarea id="f-remarks" rows={2} value={entry.remarks} onChange={(e) => set('remarks', e.target.value)} />
    </Field>
  );

  const quickView = quick && (
    <div className="quick">
      {showWhere ? (
        whereFields
      ) : (
        <button type="button" className="quick-where" onClick={() => setShowWhere(true)} aria-label={`Change the date, aircraft or route: ${where}`}>
          <span>{where}</span>
          <span className="quick-change">Change</span>
        </button>
      )}
      <fieldset className="quick-group">
        <legend>Who was flying</legend>
        <div className="choices">
          {KINDS.map(({ kind, label }) => (
            <label key={kind} className={`choice${quick.kind === kind ? ' is-on' : ''}`}>
              <input type="radio" name="q-kind" value={kind} checked={quick.kind === kind} onChange={() => changeQuick({ kind })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={`field${errors.time ? ' has-error' : ''}`}>
        <label htmlFor="q-time">Flight time, in hours</label>
        <input
          id="q-time"
          className="quick-time"
          inputMode="decimal"
          placeholder="1.3"
          autoComplete="off"
          value={quick.time}
          onChange={(e) => changeQuick({ time: e.target.value })}
          aria-invalid={errors.time ? true : undefined}
        />
        {timeError}
      </div>
      <fieldset className="quick-group">
        <legend>Also</legend>
        <div className="choices">
          <label className={`choice${quick.night ? ' is-on' : ''}`}>
            <input type="checkbox" checked={quick.night} onChange={(e) => changeQuick({ night: e.target.checked })} />
            Night
          </label>
          <label className={`choice${quick.xc ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={quick.xc}
              onChange={(e) => {
                changeQuick({ xc: e.target.checked });
                if (e.target.checked) {
                  // A cross-country goes somewhere else, so the pre-filled destination can't be right.
                  setShowWhere(true);
                  if (entry.to === entry.from) set('to', '');
                  requestAnimationFrame(() => document.getElementById('f-to')?.focus());
                }
              }}
            />
            Cross-country
          </label>
          <label className={`choice${quick.hood ? ' is-on' : ''}`}>
            <input type="checkbox" checked={quick.hood} onChange={(e) => changeQuick({ hood: e.target.checked })} />
            Hood
          </label>
        </div>
      </fieldset>
      {quick.hood && (
        <div className={`field${errors.hood ? ' has-error' : ''}`}>
          <label htmlFor="q-hood">Time under the hood, in hours</label>
          <input
            id="q-hood"
            className="narrow"
            inputMode="decimal"
            placeholder={quick.time || 'All of it'}
            autoComplete="off"
            value={quick.hoodTime}
            onChange={(e) => changeQuick({ hoodTime: e.target.value })}
            aria-invalid={errors.hood ? true : undefined}
          />
          {errors.hood && <p className="field-error">{errors.hood}</p>}
        </div>
      )}
      <div className="quick-landings">
        <span id="q-landings">Landings</span>
        <div className="stepper" role="group" aria-labelledby="q-landings">
          <button type="button" aria-label="One fewer landing" disabled={quick.landings === 0} onClick={() => changeQuick({ landings: quick.landings - 1 })}>
            −
          </button>
          <output aria-live="polite">{quick.landings}</output>
          <button type="button" aria-label="One more landing" onClick={() => changeQuick({ landings: quick.landings + 1 })}>
            +
          </button>
        </div>
      </div>
      {remarks}
      <button type="button" className="link quick-columns" onClick={() => setQuick(null)}>
        Paper columns
      </button>
    </div>
  );

  return (
    <dialog
      ref={dialog}
      className="sheet-backdrop"
      aria-labelledby="entry-title"
      onClick={(e) => e.target === e.currentTarget && tryClose()}
      onCancel={(e) => {
        // Esc: the same as Cancel, and a second Esc while asking keeps typing.
        e.preventDefault();
        if (asking) setAsking(false);
        else tryClose();
      }}
      onClose={() => {
        // Only the browser closes it, on a repeated Esc. It stays open until the pilot has answered.
        dialog.current?.showModal?.();
        tryClose();
      }}
    >
      <form ref={sheet} className="sheet" tabIndex={-1} onSubmit={submit} noValidate>
        <div className="sheet-head">
          <h2 id="entry-title">{isNew ? TITLE[layout].add : TITLE[layout].edit}</h2>
          <button type="button" className="link" onClick={tryClose}>
            Cancel
          </button>
        </div>

        <div className="sheet-body" ref={body}>
          {forward && (
            <p className="hint-box">
              Copy the “total to date” line from the last page of your paper logbook, box for box. A few questions underneath cover what the
              paper columns don’t show. To keep totals by aircraft type, add one of these per type.
            </p>
          )}
          {ftd && <p className="hint-box">FTD time counts as instrument ground time with an instructor. It is not flight time.</p>}

          {quickView}
          {!quick && whereFields}
          {!quick && !forward && !ftd && (
            <details className="glossary">
              <summary>What the columns mean</summary>
              <dl>
                <dt>Dual</dt>
                <dd>Flying with an instructor teaching you.</dd>
                <dt>PIC</dt>
                <dd>Pilot-in-command: you’re in charge, alone or with others aboard. Solo time goes here, with the tick below.</dd>
                <dt>Actual IMC</dt>
                <dd>Flown on instruments in real cloud.</dd>
                <dt>Hood</dt>
                <dd>Flown on instruments with your view outside blocked.</dd>
                <dt>FTD</dt>
                <dd>A flight training device: a simulator on the ground. It isn’t flight time.</dd>
                <dt>IFR approaches</dt>
                <dd>Instrument approaches you flew.</dd>
              </dl>
            </details>
          )}

          {quick ? null : ftd ? (
            <section className="form-section">
              <div className="col-groups">{groupInputs(FTD_ONLY)}</div>
              {timeError}
            </section>
          ) : (
            <>
              <section className="form-section" aria-labelledby="sec-time">
                <h3 id="sec-time">Flight time</h3>
                {timeError}
                <div className="col-groups">{SINGLE.map(groupInputs)}</div>
                {showMulti ? (
                  <div className="col-groups">{MULTI.map(groupInputs)}</div>
                ) : (
                  <button type="button" className="link" onClick={() => setShowMulti(true)}>
                    + Multi-engine time
                  </button>
                )}
                {!forward && (
                  <>
                    <label className="toggle">
                      <input type="checkbox" checked={entry.solo} onChange={(e) => set('solo', e.target.checked)} />
                      <span>Solo flight: you were the only person on board</span>
                    </label>
                    {errors.solo && <p className="field-error">{errors.solo}</p>}
                  </>
                )}
              </section>

              <section className="form-section" aria-labelledby="sec-xc">
                <h3 id="sec-xc">Cross-country</h3>
                <p className="hint">Part of the flight time above, logged again here. It isn’t added to the total.</p>
                <div className="col-groups">{XC.map(groupInputs)}</div>
              </section>

              <div className="col-groups">
                {groupInputs(INSTRUMENT)}
                {groupInputs(LANDINGS)}
              </div>
              {!forward && landingsQuestion}
            </>
          )}

          {forward && (askSolo || askAfterPpl) && (
            <section className="form-section questions" aria-labelledby="sec-questions">
              <h3 id="sec-questions">What your paper log doesn’t separate</h3>

              {askSolo && (
                <Question
                  name="solo"
                  legend={`How much of your ${formatHours(d.pic)} h of PIC time was solo, with nobody else on board?`}
                  value={soloAnswer}
                  onChange={setSoloAnswer}
                  labels={{ all: 'All of it', none: 'None of it', some: 'Some of it' }}
                  error={errors.soloAnswer}
                >
                  {soloAnswer === 'some' && (
                    <div className="col-inputs three">
                      {(
                        [
                          ['soloDay', 'Solo by day'],
                          ['soloNight', 'Solo at night'],
                          ['soloXc', 'Solo cross-country'],
                        ] as const
                      ).map(([k, label]) => (
                        <SmallInput
                          key={k}
                          id={`f-${k}`}
                          label={label}
                          value={soloText[k]}
                          error={errors[k]}
                          onChange={(v) => setSoloText((t) => ({ ...t, [k]: v }))}
                        />
                      ))}
                    </div>
                  )}
                </Question>
              )}
              {landingsQuestion}

              {askAfterPpl && (
                <Question
                  name="after-ppl"
                  legend={`How much of these totals did you fly after your PPL was issued${pplDate ? ` (${pplDate})` : ''}?`}
                  value={afterAnswer}
                  onChange={setAfterAnswer}
                  labels={{ none: 'None of it', all: 'All of it', some: 'Some of it' }}
                  order={['none', 'all', 'some']}
                  error={errors.afterAnswer}
                  hint="Only the CPL needs this: its 65 h of training must come after the PPL. The night rating and IFR count everything."
                >
                  {afterAnswer === 'some' && (
                    <>
                      <p className="hint">
                        Tip: take the “total to date” on the page where you passed your PPL flight test away from today’s. Leave a box blank for
                        none.
                      </p>
                      <div className="col-inputs three">
                        {AFTER_PPL_FIELDS.map((f) => (
                          <SmallInput
                            key={f}
                            id={`f-after-${f}`}
                            label={AFTER_PPL_LABEL[f]}
                            srPrefix="After your PPL: "
                            count={f === 'soloNightLandings'}
                            value={afterText[f]}
                            error={errors[`after.${f}`]}
                            onChange={(v) => setAfterText((t) => ({ ...t, [f]: v }))}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </Question>
              )}
            </section>
          )}

          {!quick && remarks}
          {onDelete && (
            <button
              type="button"
              className="link danger sheet-delete"
              onClick={() => {
                leave();
                onDelete();
              }}
            >
              Delete this entry
            </button>
          )}
        </div>

        <div className="sheet-foot">
          {asking ? (
            <>
              <p className="form-message" role="alert">
                {isNew ? `Discard this ${TITLE[layout].thing}?` : 'Discard your changes?'}
              </p>
              <button type="button" className="btn" onClick={() => setAsking(false)}>
                Keep editing
              </button>
              <button type="button" className="btn danger" onClick={leave}>
                Discard
              </button>
            </>
          ) : (
            <>
              {problems > 0 && (
                <p className="form-message is-problem" role="alert">
                  {problems === 1 ? '1 thing to fix' : `${problems} things to fix`}
                </p>
              )}
              {problems === 0 && stillDoubtful && (
                <p className="form-message" role="alert">
                  {doubts.join(' ')}
                </p>
              )}
              {!ftd && !quick && (
                <span className="line-total">
                  Flight time on this line: <strong>{formatHours(FLIGHT_COLUMNS.reduce((t, c) => t + preview[c], 0))} h</strong>
                </span>
              )}
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? 'Saving…' : stillDoubtful ? 'Save anyway' : 'Save'}
              </button>
            </>
          )}
        </div>

        <datalist id="dl-aircraft">
          {suggestions.aircraft.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="dl-reg">
          {suggestions.registrations.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="dl-place">
          {suggestions.places.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </form>
    </dialog>
  );
}

function Question({
  name,
  legend,
  value,
  onChange,
  labels,
  order = ['all', 'none', 'some'],
  error,
  hint,
  children,
}: {
  name: string;
  legend: string;
  value: Answer | null;
  onChange: (a: Answer) => void;
  labels: Record<Answer, string>;
  order?: Answer[];
  error?: string | undefined;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <fieldset className={`question${error ? ' has-error' : ''}`}>
      <legend>{legend}</legend>
      {hint && <p className="hint">{hint}</p>}
      <div className="choices">
        {order.map((a) => (
          <label key={a} className={`choice${value === a ? ' is-on' : ''}`}>
            <input type="radio" name={name} value={a} checked={value === a} onChange={() => onChange(a)} />
            {labels[a]}
          </label>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
      {children}
    </fieldset>
  );
}

function SmallInput({
  id,
  label,
  value,
  onChange,
  error,
  srPrefix,
  count = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | undefined;
  srPrefix?: string;
  count?: boolean;
}) {
  return (
    <div className={`field compact${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {srPrefix && <span className="sr-only">{srPrefix}</span>}
        {label}
      </label>
      <input
        id={id}
        inputMode={count ? 'numeric' : 'decimal'}
        placeholder={count ? '0' : '0.0'}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && (
        <p className="field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

function ColumnInputs({
  group,
  text,
  errors,
  onChange,
}: {
  group: ColumnGroup;
  text: ColumnText;
  errors: EntryErrors;
  onChange: (c: Column, v: string) => void;
}) {
  return (
    <fieldset className="col-group">
      <legend>{group.title}</legend>
      <div className="col-inputs" style={{ gridTemplateColumns: `repeat(${group.columns.length}, minmax(0, 1fr))` }}>
        {group.columns.map((c) => (
          <div key={c} className={`field compact${errors[c] ? ' has-error' : ''}`}>
            <label htmlFor={`f-${c}`}>
              <span className="sr-only">{group.title} </span>
              {COLUMN_LABEL[c]}
            </label>
            <input
              id={`f-${c}`}
              inputMode={isTimeColumn(c) ? 'decimal' : 'numeric'}
              placeholder={isTimeColumn(c) ? '0.0' : '0'}
              autoComplete="off"
              value={text[c]}
              onChange={(e) => onChange(c, e.target.value)}
              aria-invalid={errors[c] ? true : undefined}
              aria-describedby={errors[c] ? `f-${c}-err` : undefined}
            />
          </div>
        ))}
      </div>
      {group.columns.map(
        (c) =>
          errors[c] && (
            <p key={c} className="field-error" id={`f-${c}-err`}>
              {errors[c]}
            </p>
          ),
      )}
    </fieldset>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string | undefined; children: ReactNode }) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p className="field-error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}
