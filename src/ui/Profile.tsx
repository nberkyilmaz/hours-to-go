import { useRef, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import { today } from '../model/entry';
import { MEDICAL_LABEL, type Medical, type Profile } from '../model/profile';
import { hasContent, parseLogbook, type Logbook } from '../model/store';
import { GOALS, STANDARD_421_URL } from '../rules/goals';
import type { LogbookState } from '../useLogbook';
import { Feedback } from './Feedback';
import { PRIVACY_URL } from './links';
import { useSlow, useWake } from './useSlow';

export function ProfileView({ lb }: { lb: LogbookState }) {
  const { book, mode } = lb;
  return (
    <div className="stack">
      <section className="card pad" aria-labelledby="account-title">
        <h2 id="account-title">Your profile</h2>
        {mode.kind === 'account' ? (
          <SignedIn lb={lb} email={mode.email} />
        ) : (
          <>
            <p className="muted">
              Right now your logbook is saved in this browser only. Create a free profile to keep it safe and to use it on your phone and
              your computer.
            </p>
            <AuthForm lb={lb} />
          </>
        )}
      </section>

      <section className="card pad" aria-labelledby="held-title">
        <h2 id="held-title">Licences and ratings you hold</h2>
        <p className="muted">Tick what you already have. Your PPL date matters: CPL training only counts from that day.</p>
        <ul className="held-list">
          {GOALS.map((g) => {
            const held = book.profile.held[g.id];
            return (
              <li key={g.id}>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={held !== undefined}
                    onChange={(e) =>
                      lb.updateProfile((p) => {
                        const next = { ...p.held };
                        if (e.target.checked) next[g.id] = { date: '' };
                        else delete next[g.id];
                        return { ...p, held: next };
                      })
                    }
                  />
                  <span>{g.name}</span>
                </label>
                {held && (
                  <label className="inline-field">
                    <span>Issued</span>
                    <input
                      type="date"
                      value={held.date}
                      onChange={(e) => lb.updateProfile((p) => ({ ...p, held: { ...p.held, [g.id]: { date: e.target.value } } }))}
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
        <label className="inline-field">
          <span>Medical certificate</span>
          <select value={book.profile.medical} onChange={(e) => lb.updateProfile((p: Profile) => ({ ...p, medical: e.target.value as Medical }))}>
            {Object.entries(MEDICAL_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </section>

      <DataSection lb={lb} />

      <Feedback signedInAs={mode.kind === 'account' ? mode.email : null} />

      <section className="card pad muted small">
        <p>
          Requirements come from Transport Canada{' '}
          <a href={STANDARD_421_URL} target="_blank" rel="noreferrer">
            CAR Standard 421
          </a>{' '}
          (text current to NSA 2025-008). This app is a study and planning aid, not an official record: your certified personal log and
          Transport Canada decide what counts. Check anything that matters with your flight training unit.
        </p>
        <p>
          <a href={PRIVACY_URL}>Privacy and terms</a>
        </p>
      </section>
    </div>
  );
}

export type AuthTab = 'signup' | 'signin' | 'forgot';

interface AuthFormProps {
  lb: LogbookState;
  /** Given by a screen whose heading changes with the choice; otherwise the form keeps it. */
  tab?: AuthTab;
  onTabChange?: (tab: AuthTab) => void;
}

const SUBMIT: Record<AuthTab, string> = { signup: 'Create profile', signin: 'Sign in', forgot: 'Send reset link' };

/**
 * Create a profile, sign in, or ask for a password-reset link. On the Profile tab, and on the
 * welcome screen a new browser opens to.
 */
export function AuthForm({ lb, tab: givenTab, onTabChange }: AuthFormProps) {
  const [ownTab, setOwnTab] = useState<AuthTab>('signup');
  const tab = givenTab ?? ownTab;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Where a reset link was asked for, once it has been. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const slow = useSlow(busy);
  const local = hasContent(lb.guest);
  const offline = lb.mode.kind === 'guest' && lb.mode.offline;

  const setTab = (next: AuthTab) => {
    setError(null);
    setSentTo(null);
    (onTabChange ?? setOwnTab)(next);
  };

  // A sleeping server takes up to a minute to wake.
  const wake = useWake();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === 'forgot') {
        await api.forgotPassword(email);
        setSentTo(email.trim());
      } else {
        await (tab === 'signup' ? lb.signUp(email, password) : lb.signIn(email, password));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {offline && <p className="warn-text">Can’t reach the server right now, so signing in won’t work until the connection is back.</p>}
      {tab !== 'forgot' && (
        <div className="segmented" role="tablist" aria-label="Profile">
          <button type="button" role="tab" aria-selected={tab === 'signup'} className={tab === 'signup' ? 'is-on' : ''} onClick={() => setTab('signup')}>
            Create profile
          </button>
          <button type="button" role="tab" aria-selected={tab === 'signin'} className={tab === 'signin' ? 'is-on' : ''} onClick={() => setTab('signin')}>
            Sign in
          </button>
        </div>
      )}
      {sentTo ? (
        <div className="auth">
          <p className="banner ok" role="status">
            If there’s a profile for {sentTo}, a link to choose a new password is on its way. It works for an hour. If it hasn’t
            arrived in a few minutes, check your spam folder.
          </p>
          <button type="button" className="link" onClick={() => setTab('signin')}>
            Back to sign in
          </button>
        </div>
      ) : (
        <form className="auth" onSubmit={submit} onFocus={wake}>
          {tab === 'forgot' && <p className="hint">Enter the email for your profile, and we’ll send you a link to choose a new password.</p>}
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {tab !== 'forgot' && (
            <div className="field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                minLength={tab === 'signup' ? 8 : undefined}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {tab === 'signup' && <p className="hint">At least 8 characters.</p>}
            </div>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {tab === 'signup' && local && <p className="hint">Everything you’ve logged on this device moves into your new profile.</p>}
          {tab === 'signin' && local && <p className="hint">After you sign in you can add what’s on this device to your profile.</p>}
          {tab === 'signup' && (
            <p className="hint">
              Creating a profile means you agree to the <a href={PRIVACY_URL}>privacy and terms</a>.
            </p>
          )}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'One moment…' : SUBMIT[tab]}
          </button>
          {slow && (
            <p className="hint" role="status">
              The server is waking up. If nobody has used Hours to Go for a while, this takes up to a minute.
            </p>
          )}
          {tab === 'signin' && (
            <button type="button" className="link" onClick={() => setTab('forgot')}>
              Forgot your password?
            </button>
          )}
          {tab === 'forgot' && (
            <button type="button" className="link" onClick={() => setTab('signin')}>
              Back to sign in
            </button>
          )}
        </form>
      )}
    </>
  );
}

function SignedIn({ lb, email }: { lb: LogbookState; email: string }) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remove = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await lb.deleteAccount(password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <>
      <p>
        Signed in as <strong>{email}</strong>. Your logbook is saved to your profile, so it’s the same on every device you sign in on.
      </p>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => lb.signOut().catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Couldn’t sign out.'))}
        >
          Sign out
        </button>
        {!confirming && (
          <button type="button" className="link danger" onClick={() => setConfirming(true)}>
            Delete my profile
          </button>
        )}
      </div>
      {confirming && (
        <form className="danger-zone" onSubmit={remove}>
          <p>This permanently deletes your profile and every entry in it. Export your logbook first if you want a copy.</p>
          <div className="field">
            <label htmlFor="delete-password">Password</label>
            <input id="delete-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="row">
            <button type="submit" className="btn danger">
              Delete permanently
            </button>
            <button type="button" className="link" onClick={() => setConfirming(false)}>
              Keep my profile
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function DataSection({ lb }: { lb: LogbookState }) {
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const exportBook = () => {
    const blob = new Blob([JSON.stringify(lb.book, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hours-to-go-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBook = async (f: File) => {
    let parsed: Logbook | null = null;
    try {
      parsed = parseLogbook(JSON.parse(await f.text()));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      setMessage('That file isn’t a Hours to Go export.');
      return;
    }
    const ok = await lb.importLogbook(parsed);
    if (ok) setMessage('Added the entries from the file that weren’t already here. Nothing was deleted.');
  };

  return (
    <section className="card pad" aria-labelledby="data-title">
      <h2 id="data-title">Your data</h2>
      <p className="muted">Download a copy any time. Importing adds entries from a file and never deletes anything.</p>
      <div className="row">
        <button type="button" className="btn" onClick={exportBook}>
          Export logbook
        </button>
        <button type="button" className="btn" onClick={() => file.current?.click()}>
          Import a file
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importBook(f);
          }}
        />
        {lb.mode.kind !== 'account' && lb.book.entries.length > 0 && (
          <button
            type="button"
            className="link danger"
            onClick={() => window.confirm('Erase the whole logbook saved in this browser? This can’t be undone.') && lb.eraseGuest()}
          >
            Erase this device’s logbook
          </button>
        )}
      </div>
      {message && <p className="hint">{message}</p>}
    </section>
  );
}
