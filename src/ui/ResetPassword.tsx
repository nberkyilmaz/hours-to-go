import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import type { LogbookState } from '../useLogbook';
import { Mark } from './icons';
import { useSlow } from './useSlow';
import { t } from '../i18n';

interface Props {
  /** From the emailed link, which opens the page at `#reset=…`. */
  token: string;
  lb: LogbookState;
  /** Back to the app: signed in after a new password, or as it was if the pilot gives up. */
  onDone: () => void;
}

/** Where a password-reset link opens: choose a new password, and be signed in with it. */
export function ResetPassword({ token, lb, onDone }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slow = useSlow(busy);

  // Whoever opened the link is about to save a password, so wake a sleeping server now.
  useEffect(() => {
    api.health().catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await lb.resetPassword(token, password);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong. Try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <header className="welcome-head">
        <div className="welcome-hero">
          <div className="brand">
            <Mark size={32} />
            <span>{t('Hours to Go')}</span>
          </div>
          <p className="kicker">{t('Password reset')}</p>
          <h1 id="reset-title">{t('Choose a new password')}</h1>
        </div>
      </header>

      <main className="welcome-main">
        <section className="card welcome-card" aria-labelledby="reset-title">
          <p className="muted">{t('You’ll be signed in with it here, and signed out on your other devices.')}</p>
          <form className="auth" onSubmit={submit}>
            <div className="field">
              <label htmlFor="reset-password">{t('New password')}</label>
              <input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="hint">{t('At least 8 characters.')}</p>
            </div>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? t('One moment…') : t('Save new password')}
            </button>
            {slow && (
              <p className="hint" role="status">
                {t('The server is waking up. If nobody has used Hours to Go for a while, this takes up to a minute.')}
              </p>
            )}
          </form>
          <div className="welcome-skip">
            <button type="button" className="btn quiet" onClick={onDone}>
              {t('Back to Hours to Go')}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
