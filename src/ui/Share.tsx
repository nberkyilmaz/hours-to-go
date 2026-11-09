import { useEffect, useState } from 'react';
import { ApiError, api, type ShareInfo } from '../api';
import { dateText, today } from '../model/entry';

const describe = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Try again.');

/** On the Profile tab, signed in: a link an instructor can open without a profile (D56). */
export function ShareSection() {
  const [share, setShare] = useState<ShareInfo | null | 'loading' | 'unavailable'>('loading');
  /** Only known just after making it: the server keeps a one-way scramble. */
  const [link, setLink] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.share().then(
      (r) => setShare(r.share),
      () => setShare('unavailable'),
    );
  }, []);

  if (share === 'loading' || share === 'unavailable') return null;

  const make = async (forName: string) => {
    setError(null);
    setBusy(true);
    setCopied(false);
    try {
      const made = await api.createShare(forName);
      setLink(made.link);
      setShare(made.share);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.stopShare();
      setShare(null);
      setLink(null);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!);
      setCopied(true);
    } catch {
      setError('Couldn’t copy it. Select the link and copy it yourself.');
    }
  };

  return (
    <section className="card pad" aria-labelledby="share-title">
      <h2 id="share-title">Share with an instructor</h2>
      <p className="muted">
        A private link that shows where you stand on what you’re working on: hours against each requirement, and which steps are done. Not your logbook lines, exam marks,
        dates, rates or email. Anyone with the link can open it, for 30 days or until you stop sharing.
      </p>

      {link && (
        <div className="notice share-link">
          <label>
            <span>Your link</span>
            <input type="text" readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <div className="row">
            <button type="button" className="btn small" onClick={() => void copy()}>
              {copied ? 'Copied' : 'Copy the link'}
            </button>
          </div>
          <p className="hint">Send it to your instructor now. It’s only shown once.</p>
        </div>
      )}

      {share ? (
        <>
          <p role="status">
            Sharing{share.name ? ` as ${share.name}` : ''} until {dateText(today(new Date(share.expiresAt)))}.
          </p>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => void make(share.name)}>
              Make a new link
            </button>
            <button type="button" className="link danger" disabled={busy} onClick={() => void stop()}>
              Stop sharing
            </button>
          </div>
          {!link && <p className="hint">A new link replaces the old one, which stops working.</p>}
        </>
      ) : (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void make(name.trim());
          }}
        >
          <label className="inline-field">
            <span>Your name, as your instructor knows you</span>
            <input type="text" maxLength={80} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={busy}>
            Create a link
          </button>
        </form>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
