import { useMemo, type CSSProperties } from 'react';
import {
  COLUMN_LABEL,
  COUNT_COLUMNS,
  LOG_GROUPS,
  TIME_COLUMNS,
  derive,
  formatHours,
  isTimeColumn,
  type Column,
  type Derived,
  type Entry,
} from '../model/entry';
import type { FormLayout } from './EntryForm';
import { BookIcon, PlusIcon } from './icons';

interface Props {
  entries: readonly Entry[];
  onNew: (layout: FormLayout) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
}

type Sums = Record<Column, number> & Pick<Derived, 'total' | 'dual' | 'pic' | 'copilot' | 'night' | 'xcPic' | 'inst'>;

function addUp(entries: readonly Entry[]): Sums {
  const s = { total: 0, dual: 0, pic: 0, copilot: 0, night: 0, xcPic: 0, inst: 0 } as Sums;
  for (const c of [...TIME_COLUMNS, ...COUNT_COLUMNS]) s[c] = 0;
  for (const e of entries) {
    const d = derive(e);
    for (const c of [...TIME_COLUMNS, ...COUNT_COLUMNS]) s[c] += e[c];
    s.total += d.total;
    s.dual += d.dual;
    s.pic += d.pic;
    s.copilot += d.copilot;
    s.night += d.night;
    s.xcPic += d.xcPic;
    s.inst += d.inst;
  }
  return s;
}

/** Blank for zero, like a paper log. */
const h = (minutes: number) => (minutes ? formatHours(minutes) : '');
const show = (c: Column, v: number) => (isTimeColumn(c) ? formatHours(v) : String(v));

interface ListColumn {
  key: string;
  label: string;
  value: (e: Entry, d: Derived) => string;
}

export function LogbookView({ entries, onNew, onEdit, onDelete }: Props) {
  const sums = useMemo(() => addUp(entries), [entries]);
  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.date === b.date ? Number(a.forward) - Number(b.forward) : a.date < b.date ? 1 : -1)),
    [entries],
  );
  const byType = useMemo(() => {
    const groups = new Map<string, { label: string; entries: Entry[] }>();
    for (const e of entries) {
      const key = e.aircraft.trim().toUpperCase();
      const g = groups.get(key) ?? { label: e.aircraft.trim() || 'Type not given', entries: [] };
      g.entries.push(e);
      groups.set(key, g);
    }
    return [...groups.values()].map((g) => ({ label: g.label, sums: addUp(g.entries) })).sort((a, b) => b.sums.total - a.sums.total);
  }, [entries]);

  const listColumns: ListColumn[] = [
    { key: 'dual', label: 'Dual', value: (_e, d) => h(d.dual) },
    { key: 'pic', label: 'PIC', value: (_e, d) => h(d.pic) },
    ...(sums.copilot ? [{ key: 'copilot', label: 'Co-pilot', value: (_e: Entry, d: Derived) => h(d.copilot) }] : []),
    { key: 'night', label: 'Night', value: (_e, d) => h(d.night) },
    { key: 'xc', label: 'XC', value: (_e, d) => h(d.xcDual + d.xcPic) },
    { key: 'inst', label: 'Inst', value: (_e, d) => h(d.inst) },
    { key: 'ftd', label: 'FTD', value: (e) => h(e.ftd) },
    { key: 'ldg', label: 'Ldg D/N', value: (e) => (e.dayLandings || e.nightLandings ? `${e.dayLandings}/${e.nightLandings}` : '') },
  ];
  const gridStyle = { '--log-cols': `92px minmax(0, 1.4fr) minmax(0, 1.1fr) repeat(${listColumns.length}, 52px) 64px 92px` } as CSSProperties;

  const tiles: [string, string][] = [
    ['Grand total', formatHours(sums.total)],
    ['PIC', formatHours(sums.pic)],
    ['Dual', formatHours(sums.dual)],
    ['PIC cross-country', formatHours(sums.xcPic)],
    ['Night', formatHours(sums.night)],
    ['Actual + hood', formatHours(sums.inst)],
    ['FTD', formatHours(sums.ftd)],
    ['Landings day / night', `${sums.dayLandings} / ${sums.nightLandings}`],
  ];

  // Nothing logged yet: one card that says where to start, instead of eight totals of 0.0.
  if (sorted.length === 0) {
    return (
      <section className="card empty-state" aria-labelledby="empty-title">
        <span className="empty-icon">
          <BookIcon />
        </span>
        <h2 id="empty-title">No flights logged yet</h2>
        <p className="muted">
          Already flying? Start with the totals from your paper logbook, so your progress counts from where you are. Then log each flight as
          you fly it.
        </p>
        <div className="empty-actions">
          <button type="button" className="btn primary" onClick={() => onNew('forward')}>
            <PlusIcon /> Add paper logbook totals
          </button>
          <button type="button" className="btn" onClick={() => onNew('flight')}>
            Log a flight
          </button>
          <button type="button" className="btn" onClick={() => onNew('ftd')}>
            Log FTD session
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="log-actions">
        <button type="button" className="btn primary" onClick={() => onNew('flight')}>
          <PlusIcon /> Log a flight
        </button>
        <button type="button" className="btn" onClick={() => onNew('ftd')}>
          Log FTD session
        </button>
        <button type="button" className="btn" onClick={() => onNew('forward')}>
          Add paper logbook totals
        </button>
      </div>

      <dl className="tiles">
        {tiles.map(([label, value]) => (
          <div key={label} className="tile">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <details className="card fold">
        <summary>Every column, laid out like your paper logbook</summary>
        <div className="paper-totals">
          {LOG_GROUPS.map((g) => (
            <div key={g.title} className="paper-group">
              <h4>{g.title}</h4>
              <dl>
                {g.columns.map((c) => (
                  <div key={c}>
                    <dt>{COLUMN_LABEL[c]}</dt>
                    <dd>{show(c, sums[c])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <div className="paper-group grand">
            <h4>Grand total</h4>
            <p>{formatHours(sums.total)}</p>
          </div>
        </div>
      </details>

      <details className="card fold">
        <summary>By aircraft type</summary>
        <div className="table-scroll">
          <table className="type-table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Dual</th>
                <th scope="col">PIC</th>
                <th scope="col">Co-pilot</th>
                <th scope="col">Total</th>
                <th scope="col">FTD</th>
              </tr>
            </thead>
            <tbody>
              {byType.map((t) => (
                <tr key={t.label}>
                  <th scope="row">{t.label}</th>
                  <td>{h(t.sums.dual)}</td>
                  <td>{h(t.sums.pic)}</td>
                  <td>{h(t.sums.copilot)}</td>
                  <td>{h(t.sums.total)}</td>
                  <td>{h(t.sums.ftd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="card log" style={gridStyle}>
        <div className="log-row log-head" aria-hidden="true">
          <span>Date</span>
          <span>Aircraft</span>
          <span>From → To</span>
          {listColumns.map((c) => (
            <span key={c.key} className="num">
              {c.label}
            </span>
          ))}
          <span className="num">Total</span>
          <span />
        </div>
        <ul aria-label="Logbook entries">
          {sorted.map((e) => {
            const d = derive(e);
            return (
              <li key={e.id} className="log-row">
                <span className="c-date">{e.date}</span>
                <span className="c-aircraft">
                  {[e.aircraft, e.registration].filter(Boolean).join(' · ') ||
                    (e.forward ? 'All types' : <span className="muted">Aircraft not entered</span>)}
                  {e.forward && <span className="badge">Brought forward</span>}
                  {e.solo && <span className="badge">Solo</span>}
                  {d.multi > 0 && <span className="badge">ME</span>}
                </span>
                <span className="c-route">{e.from || e.to ? `${e.from || '—'} → ${e.to || '—'}` : ''}</span>
                <span className="c-figures">
                  {listColumns.map((c) => (
                    <span key={c.key} className="num" data-label={c.label}>
                      {c.value(e, d)}
                    </span>
                  ))}
                </span>
                <span className="num c-total">{d.total ? formatHours(d.total) : `${formatHours(e.ftd)} FTD`}</span>
                <span className="c-actions">
                  <button type="button" className="link" onClick={() => onEdit(e)} aria-label={`Edit the ${e.date} entry`}>
                    Edit
                  </button>
                  <button type="button" className="link danger" onClick={() => onDelete(e)} aria-label={`Delete the ${e.date} entry`}>
                    Delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
