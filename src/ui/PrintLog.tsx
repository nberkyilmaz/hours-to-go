import { useEffect, useMemo, useState } from 'react';
import { COLUMN_LABEL, LOG_GROUPS, dateText, formatHours, isTimeColumn, today, type Column, type Entry } from '../model/entry';
import { printPages, remarksCut, remarksOf, withLongRemarks, type ColumnTotals } from '../model/printlog';

/** The few headings too wide for a printed column. */
const SHORT: Partial<Record<Column, string>> = { meDayCopilot: 'Co', meNightCopilot: 'Co', actualImc: 'IMC', approaches: 'App' };
const COLUMNS = LOG_GROUPS.flatMap((g) => g.columns);

const shown = (c: Column, value: number) => (value === 0 ? '' : isTimeColumn(c) ? formatHours(value) : String(value));

/** A career's totals have to fit a column sized for one flight, and a number can't be cut short. */
const sizeOf = (text: string) => {
  const digits = text.replace('.', '').length;
  return digits >= 6 ? 'num tighter' : digits === 5 ? 'num tight' : 'num';
};

function NumberCells({ values }: { values: ColumnTotals | Entry }) {
  return COLUMNS.map((c) => {
    const text = shown(c, values[c]);
    return (
      <td key={c} className={sizeOf(text)}>
        {text}
      </td>
    );
  });
}

function TotalRow({ label, values }: { label: string; values: ColumnTotals }) {
  return (
    <tr>
      <th scope="row" colSpan={5}>
        {label}
      </th>
      <NumberCells values={values} />
      <td />
    </tr>
  );
}

interface Props {
  entries: readonly Entry[];
  onBack: () => void;
}

/** The whole logbook in the paper log's columns, for an examiner or a school (D55). The browser makes the PDF. */
export function PrintLog({ entries, onBack }: Props) {
  const [name, setName] = useState('');
  const pages = useMemo(() => printPages(entries), [entries]);
  const long = useMemo(() => withLongRemarks(entries), [entries]);
  const printed = dateText(today());

  // A browser names the PDF after the page's title.
  useEffect(() => {
    const before = document.title;
    document.title = `Logbook ${today()}`;
    return () => {
      document.title = before;
    };
  }, []);

  return (
    <main className="print-view">
      {/* Only while this is on the screen, so nothing else in the app prints sideways. */}
      <style>{'@page { size: landscape; margin: 9mm; }'}</style>
      <div className="print-bar">
        <button type="button" className="link" onClick={onBack}>
          Back to the logbook
        </button>
        <h1>Print your logbook</h1>
        <label className="inline-field">
          <span>Name on the pages</span>
          <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <p className="hint">
          {pages.length} {pages.length === 1 ? 'page' : 'pages'}, sideways. To get a file, choose “Save as PDF” as the printer. Ask your examiner or school whether they’ll accept a
          printout.
        </p>
      </div>

      <div className="print-sheets" tabIndex={0} role="group" aria-label="Preview of the pages">
        {pages.map((p, i) => (
          <section key={i} className="print-page" aria-label={`Page ${i + 1} of ${pages.length}`}>
            <header className="print-head">
              <strong>Pilot’s personal log</strong>
              <span>{name || ' '}</span>
              <span>
                Page {i + 1} of {pages.length}
              </span>
            </header>
            <table className="print-table">
              <colgroup>
                <col className="c-date" />
                <col className="c-type" />
                <col className="c-reg" />
                <col className="c-place" />
                <col className="c-place" />
                {COLUMNS.map((c) => (
                  <col key={c} className="c-num" />
                ))}
                <col className="c-remarks" />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2}>Date</th>
                  <th rowSpan={2}>Type</th>
                  <th rowSpan={2}>Reg.</th>
                  <th rowSpan={2}>From</th>
                  <th rowSpan={2}>To</th>
                  {LOG_GROUPS.map((g) => (
                    <th key={g.title} colSpan={g.columns.length} scope="colgroup">
                      {g.title}
                    </th>
                  ))}
                  <th rowSpan={2}>Remarks</th>
                </tr>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c}>{SHORT[c] ?? COLUMN_LABEL[c]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.rows.map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td>
                    <td>{e.aircraft}</td>
                    <td>{e.registration}</td>
                    <td>{e.from}</td>
                    <td>{e.to}</td>
                    <NumberCells values={e} />
                    <td>{remarksCut(e)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <TotalRow label="This page" values={p.page} />
                <TotalRow label="Brought forward" values={p.forward} />
                <TotalRow label="Total to date" values={p.toDate} />
              </tfoot>
            </table>
            <footer className="print-foot">
              <span>Printed from Hours to Go on {printed}</span>
              <span>Signature: ______________________________</span>
            </footer>
          </section>
        ))}

        {long.length > 0 && (
          <section className="print-page print-notes" aria-label="Remarks in full">
            <header className="print-head">
              <strong>Remarks in full</strong>
              <span>{name || ' '}</span>
              <span />
            </header>
            <dl>
              {long.map((e) => (
                <div key={e.id}>
                  <dt>
                    {e.date} {e.registration || e.aircraft}
                  </dt>
                  <dd>{remarksOf(e)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </main>
  );
}
