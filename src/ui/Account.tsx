import { useState, type FormEvent } from 'react';
import { ApiError, type Account } from '../api';
import type { LogbookState } from '../useLogbook';
import { useSlow } from './useSlow';

const describe = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Try again.');

/** Sends the link that confirms the profile's address again, and says how that went. */
function useSendLink(lb: LogbookState) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    setState('busy');
    try {
      await lb.sendConfirmation();
      setState('sent');
    } catch (err) {
      setError(describe(err));
      setState('idle');
    }
  };
  return { state, error, send };
}

/**
 * Above the other tabs until the address is confirmed: why it matters, and a new link. Gentle:
 * nothing waits for it, and "Later" puts it away until the app is next opened.
 */
export function ConfirmBanner({ lb, email, onLater }: { lb: LogbookState; email: string; onLater: () => void }) {
  const link = useSendLink(lb);
  return (
    <div className="banner">
      <span>
        Confirm your email, so a password reset can reach you if you ever need one. Open the link we sent to {email}.
        {link.state === 'sent' && ' A new one is on its way.'}
        {link.error && <span className="field-error"> {link.error}</span>}
      </span>
      <span className="row">
        {link.state !== 'sent' && (
          <button type="button" className="btn small" disabled={link.state === 'busy'} onClick={() => void link.send()}>
            {link.state === 'busy' ? 'Sending…' : 'Send a new link'}
          </button>
        )}
        <button type="button" className="link" onClick={onLater}>
          Later
        </button>
      </span>
    </div>
  );
}

type Open = 'email' | 'password' | 'delete' | null;

/** The Profile tab's account card, signed in: the address and its state, and changing or deleting the profile. */
export function SignedIn({ lb, account }: { lb: LogbookState; account: Account }) {
  const [open, setOpen] = useState<Open>(null);
  /** What the last change did, once it's done. */
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const link = useSendLink(lb);

  const show = (next: Open) => {
    setDone(null);
    setOpen(next);
  };

  return (
    <>
      <p>
        Signed in as <strong>{account.email}</strong>. Your logbook is saved to your profile, so it’s the same on every device you sign in on.
      </p>
      {account.pendingEmail ? (
        <div className="notice">
          <p>
            Waiting for you to confirm <strong>{account.pendingEmail}</strong>. Open the link we sent there. Until you do, your profile stays
            on {account.email}.
          </p>
          <div className="row">
            <button
              type="button"
              className="link"
              onClick={() => lb.cancelEmailChange().catch((err: unknown) => setError(describe(err)))}
            >
              Cancel the change
            </button>
          </div>
        </div>
      ) : (
        !account.confirmed && (
          <div className="notice">
            <p>
              <strong>Confirm your email.</strong> Open the link we sent to {account.email}, so a password reset can reach you if you ever
              forget your password.
            </p>
            <div className="row">
              {link.state !== 'sent' && (
                <button type="button" className="btn small" disabled={link.state === 'busy'} onClick={() => void link.send()}>
                  {link.state === 'busy' ? 'Sending…' : 'Send a new link'}
                </button>
              )}
              <button type="button" className="link" onClick={() => show('email')}>
                Wrong address? Change it
              </button>
            </div>
            {link.state === 'sent' && (
              <p className="hint" role="status">
                A new link is on its way. If it hasn’t arrived in a few minutes, check your spam folder.
              </p>
            )}
            {link.error && (
              <p className="field-error" role="alert">
                {link.error}
              </p>
            )}
          </div>
        )
      )}
      {done && (
        <p className="banner ok" role="status">
          {done}
        </p>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={() => lb.signOut().catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Couldn’t sign out.'))}>
          Sign out
        </button>
        <button type="button" className="link" aria-expanded={open === 'email'} onClick={() => show(open === 'email' ? null : 'email')}>
          Change email
        </button>
        <button type="button" className="link" aria-expanded={open === 'password'} onClick={() => show(open === 'password' ? null : 'password')}>
          Change password
        </button>
        {open !== 'delete' && (
          <button type="button" className="link danger" onClick={() => show('delete')}>
            Delete my profile
          </button>
        )}
      </div>
      {open === 'email' && <ChangeEmail lb={lb} onClose={() => setOpen(null)} />}
      {open === 'password' && (
        <ChangePassword
          lb={lb}
          email={account.email}
          onClose={(message) => {
            setOpen(null);
            setDone(message);
          }}
        />
      )}
      {open === 'delete' && <DeleteProfile lb={lb} onClose={() => setOpen(null)} />}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** A new address, and the password. Once the link is sent the account card shows the change waiting. */
function ChangeEmail({ lb, onClose }: { lb: LogbookState; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slow = useSlow(busy);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await lb.changeEmail(email, password);
      onClose();
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  };

  return (
    <form className="subform" onSubmit={submit}>
      <div className="field">
        <label htmlFor="new-email">New email</label>
        <input id="new-email" type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="email-password">Password</label>
        <input id="email-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <p>We’ll send a link to the new address. Your profile moves to it once you open the link.</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send link'}
        </button>
        <button type="button" className="link" onClick={onClose}>
          Cancel
        </button>
      </div>
      {slow && (
        <p className="hint" role="status">
          The server is waking up. If nobody has used Hours to Go for a while, this takes up to a minute.
        </p>
      )}
    </form>
  );
}

function ChangePassword({ lb, email, onClose }: { lb: LogbookState; email: string; onClose: (done: string | null) => void }) {
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slow = useSlow(busy);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await lb.changePassword(password, newPassword);
      onClose('Your password is changed. Any other device signed in to your profile is now signed out.');
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  };

  return (
    <form className="subform" onSubmit={submit}>
      {/* For password managers, so they save the new password under the right profile. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <div className="field">
        <label htmlFor="current-password">Current password</label>
        <input id="current-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <p className="hint">At least 8 characters. You stay signed in here; your other devices are signed out.</p>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'One moment…' : 'Save new password'}
        </button>
        <button type="button" className="link" onClick={() => onClose(null)}>
          Cancel
        </button>
      </div>
      {slow && (
        <p className="hint" role="status">
          The server is waking up. If nobody has used Hours to Go for a while, this takes up to a minute.
        </p>
      )}
    </form>
  );
}

function DeleteProfile({ lb, onClose }: { lb: LogbookState; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const remove = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await lb.deleteAccount(password);
    } catch (err) {
      setError(describe(err));
    }
  };

  return (
    <form className="danger-zone" onSubmit={remove}>
      <p>This permanently deletes your profile and every entry in it. Export your logbook first if you want a copy.</p>
      <div className="field">
        <label htmlFor="delete-password">Password</label>
        <input id="delete-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn danger">
          Delete permanently
        </button>
        <button type="button" className="link" onClick={onClose}>
          Keep my profile
        </button>
      </div>
    </form>
  );
}
