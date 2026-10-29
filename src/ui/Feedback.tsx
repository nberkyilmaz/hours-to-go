import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import { useSlow, useWake } from './useSlow';

/**
 * A message to the owner: a problem, a question or an idea. It is emailed, with the pilot's
 * address to reply to: their profile's when signed in, or one they may type.
 */
export function Feedback({ signedInAs }: { signedInAs: string | null }) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Where the reply will go, once a message has been sent ('' when no address was given). */
  const [sentFrom, setSentFrom] = useState<string | null>(null);
  const slow = useSlow(busy);
  const wake = useWake();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.sendFeedback(message, signedInAs ? '' : email);
      setSentFrom(signedInAs ?? email.trim());
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card pad" aria-labelledby="feedback-title">
      <h2 id="feedback-title">Send feedback</h2>
      <p className="muted">
        Something not working, a question, or an idea for Hours to Go? Your message goes straight to the developer by email, with your
        browser’s name to help with problems.
      </p>
      {sentFrom !== null ? (
        <div className="auth">
          <p className="banner ok" role="status">
            Thanks, your message was sent.{sentFrom ? ` Any reply will go to ${sentFrom}.` : ''}
          </p>
          <button type="button" className="link" onClick={() => setSentFrom(null)}>
            Send another message
          </button>
        </div>
      ) : (
        <form className="auth" onSubmit={submit} onFocus={wake}>
          <div className="field">
            <label htmlFor="feedback-message">Message</label>
            <textarea id="feedback-message" rows={5} maxLength={4000} required value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {signedInAs ? (
            <p className="hint">Replies go to {signedInAs}.</p>
          ) : (
            <div className="field">
              <label htmlFor="feedback-email">Your email, if you’d like a reply</label>
              <input id="feedback-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send message'}
          </button>
          {slow && (
            <p className="hint" role="status">
              The server is waking up. If nobody has used Hours to Go for a while, this takes up to a minute.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
