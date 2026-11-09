import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
import { LOG_FILTERS, byMonth, matches, shortDate, type LogFilter } from '../model/search';
import type { FormLayout } from './EntryForm';
import { BookIcon, PlusIcon } from './icons';

interface Props {
  entries: readonly Entry[];
  onNew: (layout: FormLayout) => void;
  onEdit: (entry: Entry) => void;
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

/** Enough flights that finding one needs help. */
const SEARCH_FROM = 6;

export function LogbookView({ entries, onNew, onEdit }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LogFilter>('all');
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

  // Only the columns with something in them, so the route gets the room.
  const listColumns = (
    [
      { key: 'dual', label: 'Dual', value: (_e, d) => h(d.dual) },
      { key: 'pic', label: 'PIC', value: (_e, d) => h(d.pic) },
      { key: 'copilot', label: 'Co-pilot', value: (_e, d) => h(d.copilot) },
      { key: 'night', label: 'Night', value: (_e, d) => h(d.night) },
      { key: 'xc', label: 'XC', value: (_e, d) => h(d.xcDual + d.xcPic) },
      { key: 'inst', label: 'Inst', value: (_e, d) => h(d.inst) },
      { key: 'ftd', label: 'FTD', value: (e) => h(e.ftd) },
      { key: 'ldg', label: 'Ldg D/N', value: (e) => (e.dayLandings || e.nightLandings ? `${e.dayLandings}/${e.nightLandings}` : '') },
    ] satisfies ListColumn[]
  ).filter((c) => entries.some((e) => c.value(e, derive(e)) !== ''));
  const gridStyle = { '--log-cols': `92px minmax(120px, 1.4fr) minmax(120px, 1.1fr) repeat(${listColumns.length}, 52px) 64px` } as CSSProperties;

  const months = byMonth(sorted.filter((e) => matches(e, query, filter)));
  const showing = months.reduce((n, m) => n + m.entries.length, 0);
  const tile = ([label, value]: [string, string]) => (
    <div key={label} className="tile">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  const mainTiles: [string, string][] = [
    ['Grand total', formatHours(sums.total)],
    ['PIC', formatHours(sums.pic)],
    ['Dual', formatHours(sums.dual)],
  ];
  const moreTiles: [string, string][] = [
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
        <h1 className="sr-only">Logbook</h1>
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
      <h1 className="sr-only">Logbook</h1>
      <dl className="tiles tiles-main">{mainTiles.map(tile)}</dl>

      <details className="card fold">
        <summary>All totals, by column and aircraft type</summary>
        <dl className="tiles tiles-more">{moreTiles.map(tile)}</dl>
        <div className="paper-totals">
          {LOG_GROUPS.filter((g) => g.columns.some((c) => sums[c] > 0)).map((g) => (
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
        <h3 className="fold-title">By aircraft type</h3>
        <div className="table-scroll">
          <table className="type-table">
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Dual</th>
                <th scope="col">PIC</th>
                {sums.copilot > 0 && <th scope="col">Co-pilot</th>}
                <th scope="col">Total</th>
                {sums.ftd > 0 && <th scope="col">FTD</th>}
              </tr>
            </thead>
            <tbody>
              {byType.map((t) => (
                <tr key={t.label}>
                  <th scope="row">{t.label}</th>
                  <td>{h(t.sums.dual)}</td>
                  <td>{h(t.sums.pic)}</td>
                  {sums.copilot > 0 && <td>{h(t.sums.copilot)}</td>}
                  <td>{h(t.sums.total)}</td>
                  {sums.ftd > 0 && <td>{h(t.sums.ftd)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="log-actions">
        <button type="button" className="link" onClick={() => onNew('ftd')}>
          Log FTD session
        </button>
        <button type="button" className="link" onClick={() => onNew('forward')}>
          Add paper logbook totals
        </button>
        <a className="link" href="#print">
          Print or save as PDF
        </a>
      </div>

      {sorted.length >= SEARCH_FROM && (
        <div className="log-find">
          <input type="search" aria-label="Search your logbook" placeholder="Search aircraft, airports, remarks" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="choices" role="group" aria-label="Show">
            {LOG_FILTERS.map((f) => (
              <button key={f.id} type="button" className={`choice${filter === f.id ? ' is-on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
          {(query.trim() !== '' || filter !== 'all') && (
            <p className="hint" role="status">
              {showing} of {sorted.length} {sorted.length === 1 ? 'entry' : 'entries'}
            </p>
          )}
        </div>
      )}

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
        </div>
        <ul aria-label="Logbook entries">
          {months.map((m) => (
            <MonthRows key={m.key} label={m.label} minutes={m.minutes}>
              {m.entries.map((e) => {
                const d = derive(e);
                const landings = e.dayLandings + e.nightLandings;
                return (
                  <li key={e.id} className="log-entry">
                    <button type="button" className="log-row" onClick={() => onEdit(e)} aria-label={`Edit the ${e.date} entry`}>
                      <span className="c-date">{shortDate(e.date)}</span>
                      <span className="c-aircraft">
                        {[e.aircraft, e.registration].filter(Boolean).join(' ') || (e.forward ? 'All types' : <span className="muted">Aircraft not entered</span>)}
                        {e.forward && <span className="badge">Brought forward</span>}
                        {e.solo && <span className="badge">Solo</span>}
                        {d.multi > 0 && <span className="badge">ME</span>}
                      </span>
                      <span className="c-sub">
                        <span className="c-route">{e.from || e.to ? `${e.from || '—'} → ${e.to || '—'}` : ''}</span>
                        <span className="c-figures">
                          {listColumns.map((c) => (
                            <span key={c.key} className="num" data-label={c.label}>
                              {c.value(e, d)}
                            </span>
                          ))}
                        </span>
                        {landings > 0 && <span className="c-landings">{landings === 1 ? '1 landing' : `${landings} landings`}</span>}
                      </span>
                      <span className="num c-total">{d.total ? formatHours(d.total) : `${formatHours(e.ftd)} FTD`}</span>
                    </button>
                  </li>
                );
              })}
            </MonthRows>
          ))}
        </ul>
        {months.length === 0 && <p className="log-none">Nothing matches that.</p>}
      </div>
    </div>
  );
}

function MonthRows({ label, minutes, children }: { label: string; minutes: number; children: ReactNode }) {
  return (
    <>
      <li className="log-month">
        <h2>{label}</h2>
        {minutes > 0 && <span>{formatHours(minutes)} h</span>}
      </li>
      {children}
    </>
  );
}
