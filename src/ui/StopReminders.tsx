import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import type { LogbookState } from '../useLogbook';
import { Mark } from './icons';
import { useSlow } from './useSlow';

interface Props {
  /** From the link in a reminder, which opens the page at `#stop=…`. */
  token: string;
  lb: LogbookState;
  onDone: () => void;
}

/** Where the link in a reminder opens: no sign-in, and nothing to fill in. */
export function StopReminders({ token, lb, onDone }: Props) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slow = useSlow(!done && !error);
  const started = useRef(false);
  const ready = lb.mode.kind !== 'loading';
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    lb.stopReminders(token).then(
      () => setDone(true),
      (err: unknown) => setError(err instanceof ApiError ? err.message : 'Something went wrong. Try the link again.'),
    );
  }, [ready, lb, token]);

  const title = done ? 'Reminders are off' : error ? 'This link didn’t work' : 'Turning reminders off…';

  return (
    <div className="welcome">
      <header className="welcome-head">
        <div className="welcome-hero">
          <div className="brand">
            <Mark size={32} />
            <span>Hours to Go</span>
          </div>
          <p className="kicker">Your email</p>
          <h1 id="stop-title">{title}</h1>
        </div>
      </header>

      <main className="welcome-main">
        <section className="card welcome-card" aria-labelledby="stop-title">
          {done && <p role="status">You won’t get any more reminder emails. You can turn them back on from the Profile tab.</p>}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {slow && (
            <p className="hint" role="status">
              The server is waking up. If nobody has used Hours to Go for a while, this takes up to a minute.
            </p>
          )}
          <div className="welcome-skip">
            <button type="button" className={done ? 'btn primary' : 'btn quiet'} onClick={onDone}>
              Open Hours to Go
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
