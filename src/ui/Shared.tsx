import { useEffect, useState } from 'react';
import { ApiError, api } from '../api';
import { dateText, formatHours, formatHoursUp, today } from '../model/entry';
import type { SharedLine, SharedProgress } from '../rules/shared';
import { Ring } from './Ring';
import { CheckIcon, Mark } from './icons';
import { keepUnits } from './text';
import { useSlow } from './useSlow';

const amount = (l: SharedLine) => (l.unit === 'hours' ? `${formatHours(l.have!)} of ${formatHours(l.need!)} h` : `${l.have} of ${l.need}`);

/** Where a read-only link opens, for someone with no reason to have a profile (D56). */
export function Shared({ token, onDone }: { token: string; onDone: () => void }) {
  const [data, setData] = useState<SharedProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slow = useSlow(!data && !error);
  useEffect(() => {
    api.shared(token).then(setData, (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong. Try the link again.'));
  }, [token]);

  const title = data ? `${data.name || 'A pilot'}: ${data.goal}` : error ? 'This link didn’t work' : 'Loading…';

  return (
    <div className="welcome">
      <header className="welcome-head">
        <div className="welcome-hero">
          <div className="brand">
            <Mark size={32} />
            <span>Hours to Go</span>
          </div>
          <p className="kicker">Shared progress, read only</p>
          <h1 id="shared-title">{title}</h1>
        </div>
      </header>

      <main className="welcome-main stack">
        {error && (
          <section className="card welcome-card" aria-labelledby="shared-title">
            <p className="field-error" role="alert">
              {error}
            </p>
            <div className="welcome-skip">
              <button type="button" className="btn quiet" onClick={onDone}>
                Open Hours to Go
              </button>
            </div>
          </section>
        )}
        {slow && (
          <p className="hint" role="status">
            The server is waking up. If nobody has used Hours to Go for a while, this takes up to a minute.
          </p>
        )}
        {data && (
          <>
            <section className="card pad shared-summary">
              <Ring percent={data.percent} />
              <div>
                <p>
                  {data.complete ? (
                    <strong>All the requirements are met.</strong>
                  ) : (
                    <>
                      <strong>At least {formatHoursUp(data.left)} h</strong> of flying to go.
                    </>
                  )}
                </p>
                <p className="hint">
                  As of {dateText(data.asOf)}. This is what the pilot has logged and ticked, and nobody has checked it. The link works until {dateText(today(new Date(data.expiresAt)))}.
                </p>
              </div>
            </section>
            {data.sections.map((s) => (
              <section key={s.title} className="card pad req-section">
                <h2>{s.title}</h2>
                <ul className="reqs">
                  {s.lines.map((l, i) => (
                    <li key={i} className={`req${l.met ? ' is-met' : ''}`} style={{ marginLeft: l.depth * 20 }}>
                      <div className="req-line">
                        <span className={`dot${l.met ? ' is-met' : ''}`} aria-hidden="true">
                          {l.met && <CheckIcon />}
                        </span>
                        <div className="req-body">
                          <div className="req-label">
                            <span>{keepUnits(l.label)}</span> <span className="cite">{l.cite}</span>
                            <span className="sr-only">{l.met ? ' (met)' : ' (not met)'}</span>
                          </div>
                          {l.have !== null && <p className="note muted">{amount(l)}</p>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
