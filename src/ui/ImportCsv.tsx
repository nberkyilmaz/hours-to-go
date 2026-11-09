import { useEffect, useMemo, useRef } from 'react';
import { summarize, type CsvRead } from '../model/csv';
import { dateText, formatHours, today, type Entry } from '../model/entry';
import { t } from '../i18n';

interface Props {
  read: CsvRead;
  existing: readonly Entry[];
  onAdd: (fresh: Entry[]) => void;
  onCancel: () => void;
}

const lines = (n: number) => (n === 1 ? t('1 line') : t('{n} lines', { n }));

/** What a spreadsheet would add, before it's added: a column in minutes shows up here as an absurd total (D54). */
export function ImportCsv({ read, existing, onAdd, onCancel }: Props) {
  const s = useMemo(() => summarize(read, existing, today()), [read, existing]);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => panel.current?.focus(), []);
  const count = s.fresh.length;
  return (
    <div className="notice csv-preview" ref={panel} tabIndex={-1} role="group" aria-label={t('What this file would add')}>
      {count > 0 ? (
        <p>
          <strong>{lines(count)}{' '}{t('to add')}</strong>, {formatHours(s.minutes)}{' '}{t('h of flight time, from')}{' '}{dateText(s.first!)}{' '}{t('to')}{' '}{dateText(s.last!)}.
        </p>
      ) : (
        <p>
          <strong>{t('Nothing new to add.')}</strong>
        </p>
      )}
      {s.already > 0 && <p>{lines(s.already)}{' '}{t('already in your logbook will stay as they are.')}</p>}
      {s.doubts > 0 && <p className="warn-text">{lines(s.doubts)}{' '}{t('over 8 hours or dated in the future. Check them after adding.')}</p>}
      {read.problems.length > 0 && (
        <details>
          <summary>{lines(read.problems.length)}{' '}{t('can’t be added')}</summary>
          <ul className="csv-problems">
            {read.problems.slice(0, 20).map((p) => (
              <li key={p.row}>
                {t('Row')}{' '}{p.row}: {p.why}
              </li>
            ))}
            {read.problems.length > 20 && <li>{t('And')}{' '}{read.problems.length - 20}{' '}{t('more.')}</li>}
          </ul>
        </details>
      )}
      {read.unused.length > 0 && (
        <p className="hint">
          {t('Not used:')}{' '}{read.unused.join(', ')}{t('. A heading has to say exactly which column it is, like “SE day PIC”, and totals are worked out here.')}
        </p>
      )}
      <div className="row">
        {count > 0 && (
          <button type="button" className="btn primary" onClick={() => onAdd(s.fresh)}>
            {t('Add')}{' '}{lines(count)}
          </button>
        )}
        <button type="button" className="link" onClick={onCancel}>
          {count > 0 ? t('Cancel') : t('Close')}
        </button>
      </div>
    </div>
  );
}
