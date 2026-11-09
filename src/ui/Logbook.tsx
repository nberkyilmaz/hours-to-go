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
import { t } from '../i18n';

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
      const g = groups.get(key) ?? { label: e.aircraft.trim() || t('Type not given'), entries: [] };
      g.entries.push(e);
      groups.set(key, g);
    }
    return [...groups.values()].map((g) => ({ label: g.label, sums: addUp(g.entries) })).sort((a, b) => b.sums.total - a.sums.total);
  }, [entries]);

  // Only the columns with something in them, so the route gets the room.
  const listColumns = (
    [
      { key: 'dual', label: t('Dual'), value: (_e, d) => h(d.dual) },
      { key: 'pic', label: 'PIC', value: (_e, d) => h(d.pic) },
      { key: 'copilot', label: 'Co-pilot', value: (_e, d) => h(d.copilot) },
      { key: 'night', label: t('Night'), value: (_e, d) => h(d.night) },
      { key: 'xc', label: 'XC', value: (_e, d) => h(d.xcDual + d.xcPic) },
      { key: 'inst', label: t('Inst'), value: (_e, d) => h(d.inst) },
      { key: 'ftd', label: 'FTD', value: (e) => h(e.ftd) },
      { key: 'ldg', label: t('Ldg D/N'), value: (e) => (e.dayLandings || e.nightLandings ? `${e.dayLandings}/${e.nightLandings}` : '') },
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
    [t('Grand total'), formatHours(sums.total)],
    ['PIC', formatHours(sums.pic)],
    [t('Dual'), formatHours(sums.dual)],
  ];
  const moreTiles: [string, string][] = [
    ['PIC cross-country', formatHours(sums.xcPic)],
    [t('Night'), formatHours(sums.night)],
    ['Actual + hood', formatHours(sums.inst)],
    ['FTD', formatHours(sums.ftd)],
    [t('Landings day / night'), `${sums.dayLandings} / ${sums.nightLandings}`],
  ];

  // Nothing logged yet: one card that says where to start, instead of eight totals of 0.0.
  if (sorted.length === 0) {
    return (
      <section className="card empty-state" aria-labelledby="empty-title">
        <h1 className="sr-only">{t('Logbook')}</h1>
        <span className="empty-icon">
          <BookIcon />
        </span>
        <h2 id="empty-title">{t('No flights logged yet')}</h2>
        <p className="muted">
          {t('Already flying? Start with the totals from your paper logbook, so your progress counts from where you are. Then log each flight as you fly it.')}
        </p>
        <div className="empty-actions">
          <button type="button" className="btn primary" onClick={() => onNew('forward')}>
            <PlusIcon />{' '}{t('Add paper logbook totals')}
          </button>
          <button type="button" className="btn" onClick={() => onNew('flight')}>
            {t('Log a flight')}
          </button>
          <button type="button" className="btn" onClick={() => onNew('ftd')}>
            {t('Log FTD session')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="stack">
      <h1 className="sr-only">{t('Logbook')}</h1>
      <dl className="tiles tiles-main">{mainTiles.map(tile)}</dl>

      <details className="card fold">
        <summary>{t('All totals, by column and aircraft type')}</summary>
        <dl className="tiles tiles-more">{moreTiles.map(tile)}</dl>
        <div className="paper-totals">
          {LOG_GROUPS.filter((g) => g.columns.some((c) => sums[c] > 0)).map((g) => (
            <div key={g.title} className="paper-group">
              <h4>{t(g.title)}</h4>
              <dl>
                {g.columns.map((c) => (
                  <div key={c}>
                    <dt>{t(COLUMN_LABEL[c])}</dt>
                    <dd>{show(c, sums[c])}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <div className="paper-group grand">
            <h4>{t('Grand total')}</h4>
            <p>{formatHours(sums.total)}</p>
          </div>
        </div>
        <h3 className="fold-title">{t('By aircraft type')}</h3>
        <div className="table-scroll">
          <table className="type-table">
            <thead>
              <tr>
                <th scope="col">{t('Type')}</th>
                <th scope="col">{t('Dual')}</th>
                <th scope="col">{t('PIC')}</th>
                {sums.copilot > 0 && <th scope="col">{t('Co-pilot')}</th>}
                <th scope="col">{t('Total')}</th>
                {sums.ftd > 0 && <th scope="col">{t('FTD')}</th>}
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
          {t('Log FTD session')}
        </button>
        <button type="button" className="link" onClick={() => onNew('forward')}>
          {t('Add paper logbook totals')}
        </button>
        <a className="link" href="#print">
          {t('Print or save as PDF')}
        </a>
      </div>

      {sorted.length >= SEARCH_FROM && (
        <div className="log-find">
          <input type="search" aria-label={t('Search your logbook')} placeholder={t('Search aircraft, airports, remarks')} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="choices" role="group" aria-label={t('Show')}>
            {LOG_FILTERS.map((f) => (
              <button key={f.id} type="button" className={`choice${filter === f.id ? ' is-on' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {t(f.label)}
              </button>
            ))}
          </div>
          {(query.trim() !== '' || filter !== 'all') && (
            <p className="hint" role="status">
              {sorted.length === 1 ? t('{showing} of 1 entry', { showing }) : t('{showing} of {total} entries', { showing, total: sorted.length })}
            </p>
          )}
        </div>
      )}

      <div className="card log" style={gridStyle}>
        <div className="log-row log-head" aria-hidden="true">
          <span>{t('Date')}</span>
          <span>{t('Aircraft')}</span>
          <span>{t('From → To')}</span>
          {listColumns.map((c) => (
            <span key={c.key} className="num">
              {c.label}
            </span>
          ))}
          <span className="num">{t('Total')}</span>
        </div>
        <ul aria-label={t('Logbook entries')}>
          {months.map((m) => (
            <MonthRows key={m.key} label={m.label} minutes={m.minutes}>
              {m.entries.map((e) => {
                const d = derive(e);
                const landings = e.dayLandings + e.nightLandings;
                return (
                  <li key={e.id} className="log-entry">
                    <button type="button" className="log-row" onClick={() => onEdit(e)} aria-label={t('Edit the {date} entry', { date: e.date })}>
                      <span className="c-date">{shortDate(e.date)}</span>
                      <span className="c-aircraft">
                        {[e.aircraft, e.registration].filter(Boolean).join(' ') || (e.forward ? t('All types') : <span className="muted">{t('Aircraft not entered')}</span>)}
                        {e.forward && <span className="badge">{t('Brought forward')}</span>}
                        {e.solo && <span className="badge">{t('Solo')}</span>}
                        {d.multi > 0 && <span className="badge">{t('ME')}</span>}
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
                        {landings > 0 && <span className="c-landings">{landings === 1 ? t('1 landing') : t('{n} landings', { n: landings })}</span>}
                      </span>
                      <span className="num c-total">{d.total ? formatHours(d.total) : `${formatHours(e.ftd)} FTD`}</span>
                    </button>
                  </li>
                );
              })}
            </MonthRows>
          ))}
        </ul>
        {months.length === 0 && <p className="log-none">{t('Nothing matches that.')}</p>}
      </div>
    </div>
  );
}

function MonthRows({ label, minutes, children }: { label: string; minutes: number; children: ReactNode }) {
  return (
    <>
      <li className="log-month">
        <h2>{label}</h2>
        {minutes > 0 && <span>{formatHours(minutes)}{' '}{t('h')}</span>}
      </li>
      {children}
    </>
  );
}
