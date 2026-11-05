import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import type { LogbookState } from '../useLogbook';
import { Mark } from './icons';
import { useSlow } from './useSlow';

interface Props {
  /** From the emailed link, which opens the page at `#confirm=…`. */
  token: string;
  lb: LogbookState;
  onDone: () => void;
}

/** Where a link that confirms an address opens: it is spent at once, with nothing to fill in. */
export function ConfirmEmail({ token, lb, onDone }: Props) {
  const [result, setResult] = useState<{ email: string; changed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slow = useSlow(!result && !error);
  const started = useRef(false);
  // Once the app knows whether a profile is signed in here, so the change shows on it. And once
  // only: in development React runs an effect twice, and a link works once.
  const ready = lb.mode.kind !== 'loading';
  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    lb.confirmEmail(token).then(setResult, (err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try the link again.'),
    );
  }, [ready, lb, token]);

  const title = result ? (result.changed ? 'Your email is changed' : 'Your email is confirmed') : error ? 'This link didn’t work' : 'Confirming your email…';

  return (
    <div className="welcome">
      <header className="welcome-head">
        <div className="welcome-hero">
          <div className="brand">
            <Mark size={32} />
            <span>Hours to Go</span>
          </div>
          <p className="kicker">Your email</p>
          <h1 id="confirm-title">{title}</h1>
        </div>
      </header>

      <main className="welcome-main">
        <section className="card welcome-card" aria-labelledby="confirm-title">
          {result?.changed && (
            <p role="status">
              Your profile now uses <strong>{result.email}</strong>. Sign in with it from now on.
            </p>
          )}
          {result && !result.changed && (
            <p role="status">
              <strong>{result.email}</strong> is confirmed. If you ever forget your password, a reset link can reach you there.
            </p>
          )}
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
            <button type="button" className={result ? 'btn primary' : 'btn quiet'} onClick={onDone}>
              Open Hours to Go
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
