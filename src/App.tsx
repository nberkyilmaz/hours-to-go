import { useCallback, useEffect, useMemo, useState } from 'react';
import { blankEntry, derive, formatHours, formatHoursUp, isFtdOnly, newId, today, type Entry } from './model/entry';
import { hasContent, isSnoozed, snooze } from './model/store';
import { ConfirmBanner } from './ui/Account';
import { ConfirmEmail } from './ui/ConfirmEmail';
import { EntryForm, type FormLayout, type Suggestions } from './ui/EntryForm';
import { goalById } from './rules/goals';
import { momentOf } from './rules/moment';
import { BookIcon, CloudCheckIcon, CloudOffIcon, CloudUpIcon, Mark, PlusIcon, ProgressIcon, UserIcon } from './ui/icons';
import { LogbookView } from './ui/Logbook';
import { ProfileView } from './ui/Profile';
import { ProgressView } from './ui/Progress';
import { ResetPassword } from './ui/ResetPassword';
import { Welcome } from './ui/Welcome';
import { useLogbook, type Sync } from './useLogbook';

type Tab = 'progress' | 'log' | 'profile';

const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'progress', label: 'Progress', Icon: ProgressIcon },
  { id: 'log', label: 'Logbook', Icon: BookIcon },
  { id: 'profile', label: 'Profile', Icon: UserIcon },
];

/** An emailed link: to reset a password, or to confirm an address. It opens the page at `#reset=…` or `#confirm=…`. */
interface EmailedLink {
  kind: 'reset' | 'confirm';
  token: string;
}

function linkInUrl(): EmailedLink | null {
  const found = /^#(reset|confirm)=([\w-]+)$/.exec(window.location.hash);
  return found ? { kind: found[1] as EmailedLink['kind'], token: found[2]! } : null;
}

/** A new screen starts at its top, not wherever the last one was scrolled to. */
function toTop() {
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
}

/** The server on the free plan sleeps when nobody has used it for a while and takes up to a minute to wake. */
function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="loading" role="status">
      <Mark size={44} />
      <span className="loading-title">Loading your logbook…</span>
      {slow && <span>If nobody has opened Hours to Go for a while, its server takes up to a minute to wake up.</span>}
    </div>
  );
}

const changes = (n: number) => (n === 1 ? '1 change' : `${n} changes`);

/**
 * Signed in: whether the profile has everything (D41). On a phone it says only "Saved", "Saving…"
 * or "Offline", so the name keeps to one line; the label still says all of it.
 */
function SaveState({ sync, onClick }: { sync: Sync; onClick: () => void }) {
  if (sync.offline) {
    const label = sync.pending > 0 ? `Offline. ${changes(sync.pending)} kept on this device` : 'Offline';
    return (
      <button type="button" className="save-state is-offline" aria-label={label} onClick={onClick}>
        {/* No wider than "Saved to your profile", so going offline doesn't move the top bar. */}
        <CloudOffIcon /> Offline<span className="save-more">{sync.pending > 0 ? ` · ${sync.pending} to save` : ''}</span>
      </button>
    );
  }
  if (sync.pending > 0) {
    return (
      <button type="button" className="save-state is-saving" aria-label="Saving to your profile" onClick={onClick}>
        <CloudUpIcon /> Saving<span className="save-more"> to your profile</span>…
      </button>
    );
  }
  return (
    <button type="button" className="save-state" aria-label="Saved to your profile" onClick={onClick}>
      <CloudCheckIcon /> Saved<span className="save-more"> to your profile</span>
    </button>
  );
}

interface Toast {
  text: JSX.Element;
  undo: () => void;
  progress: boolean;
}

const TOAST_MS = 8000;

/** After a flight is saved or deleted: what it did, and the way back. */
function Toast({ toast, onUndo, onProgress, onDone }: { toast: Toast; onUndo: () => void; onProgress: () => void; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, onDone]);
  return (
    <div className="toast" role="status">
      <p>{toast.text}</p>
      <span className="toast-actions">
        {toast.progress && (
          <button type="button" className="link" onClick={onProgress}>
            See progress
          </button>
        )}
        <button type="button" className="link" onClick={onUndo}>
          Undo
        </button>
      </span>
    </div>
  );
}

export function App() {
  const lb = useLogbook();
  const [tab, setTab] = useState<Tab>('progress');
  const [draft, setDraft] = useState<{ entry: Entry; isNew: boolean; layout: FormLayout } | null>(null);
  const [hideGuestNudge, setHideGuestNudge] = useState(() => isSnoozed('guest-nudge'));
  const [hideStranded, setHideStranded] = useState(false);
  const [hideConfirm, setHideConfirm] = useState(() => isSnoozed('confirm-email'));
  const [link, setLink] = useState(linkInUrl);
  const [hash, setHash] = useState(window.location.hash);
  const [toast, setToast] = useState<Toast | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const entries = lb.book.entries;

  useEffect(() => {
    document.title = `${TABS.find((t) => t.id === tab)?.label} · Hours to Go`;
  }, [tab]);

  // Out of the address bar and the history once read, so the link isn't bookmarked or shared.
  useEffect(() => {
    if (link) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [link]);
  // A link pasted into a tab that already has the app open changes only the fragment, so the
  // page doesn't load again.
  useEffect(() => {
    const onHash = () => {
      setHash(window.location.hash);
      const found = linkInUrl();
      if (found) setLink(found);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const suggestions = useMemo((): Suggestions => {
    const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort();
    return {
      aircraft: uniq(entries.map((e) => e.aircraft)),
      registrations: uniq(entries.map((e) => e.registration)),
      places: uniq(entries.flatMap((e) => [e.from, e.to])),
    };
  }, [entries]);

  const closeDraft = useCallback(() => setDraft(null), []);
  const startEntry = (layout: FormLayout, filled?: Partial<Entry>) => {
    const entry = blankEntry(layout === 'forward');
    const newest = [...entries].filter((e) => !e.forward).sort((a, b) => (a.date < b.date ? 1 : -1));
    // Most students fly the same aircraft from the same field, so start from the last one.
    const last = newest.find((e) => (layout === 'ftd' ? isFtdOnly(e) : derive(e).total > 0));
    // Most flights come back where they left from; a cross-country says otherwise.
    if (last && layout === 'flight') Object.assign(entry, { aircraft: last.aircraft, registration: last.registration, from: last.from, to: last.from });
    if (last && layout === 'ftd') entry.aircraft = last.aircraft;
    if (filled) Object.assign(entry, filled);
    // A cross-country goes somewhere else, so the pilot says where.
    if (filled?.xcDayDual || filled?.xcDayPic || filled?.xcNightDual || filled?.xcNightPic) entry.to = '';
    setDraft({ entry, isNew: true, layout });
  };
  /** The same flight again: students fly the same lesson many times. */
  const logAgain = (e: Entry) => setDraft({ entry: { ...e, id: newId(), date: today(), remarks: '' }, isNew: true, layout: isFtdOnly(e) ? 'ftd' : 'flight' });
  const editEntry = (entry: Entry) =>
    setDraft({ entry, isNew: false, layout: entry.forward ? 'forward' : isFtdOnly(entry) ? 'ftd' : 'flight' });

  const saveEntry = async (entry: Entry) => {
    const isNew = draft?.isNew === true;
    const moment = isNew ? momentOf(goalById(lb.book.profile.focus), entries, entry, lb.book.profile, today()) : null;
    const ok = await lb.saveEntry(entry);
    if (ok && isNew) {
      const d = derive(entry);
      setToast({
        text: (
          <>
            <strong>{formatHours(d.total || entry.ftd)} h logged.</strong>
            {moment?.firstSolo && ' Your first solo. Congratulations!'}
            {moment?.complete ? ` Every ${moment.short} requirement is met.` : moment && moment.now < moment.was ? ` ${moment.short}: ${formatHoursUp(moment.now)} h to go, was ${formatHoursUp(moment.was)}.` : ''}
            {moment?.halfway && !moment.complete && ' Halfway there.'}
            {moment && moment.finished.length > 0 && !moment.complete ? ` Done: ${moment.finished[0]}.` : ''}
          </>
        ),
        undo: () => void lb.removeEntry(entry.id),
        progress: true,
      });
    }
    return ok;
  };

  const deleteEntry = (entry: Entry) => {
    void lb.removeEntry(entry.id);
    setToast({
      text: <>Deleted the {[entry.date, entry.aircraft, entry.registration].filter(Boolean).join(' ')} entry.</>,
      undo: () => void lb.saveEntry(entry),
      progress: false,
    });
  };

  // A first visit, with nothing logged yet: recommend a profile before anything else.
  const welcoming = lb.mode.kind === 'guest' && !lb.mode.offline && !lb.welcomed && !hasContent(lb.guest);
  // The welcome's buttons are low on a phone, so the app it gives way to would open scrolled.
  useEffect(toTop, [welcoming, tab, link]);

  // The home-screen icon's "Log a flight" shortcut opens the app at #log.
  const ready = lb.mode.kind !== 'loading' && !welcoming;
  useEffect(() => {
    if (!ready || hash !== '#log') return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setHash('');
    startEntry('flight');
    // Only when the app has come up; startEntry reads the logbook of the moment.
  }, [ready, hash]);

  if (link?.kind === 'reset') return <ResetPassword token={link.token} lb={lb} onDone={() => setLink(null)} />;
  if (link?.kind === 'confirm') return <ConfirmEmail token={link.token} lb={lb} onDone={() => setLink(null)} />;
  if (lb.mode.kind === 'loading') return <Loading />;
  if (welcoming) return <Welcome lb={lb} />;

  const { mode, book } = lb;
  const strandedCount = mode.kind === 'account' && hasContent(lb.guest) ? lb.guest.entries.length : 0;

  // One notice at a time, the most pressing first: a stack of them pushed the app off the first screen.
  const notices: JSX.Element[] = [];
  if (mode.kind === 'guest' && mode.offline) {
    notices.push(<div className="banner warn">Can’t reach the server. You’re working on this device only; sign in again once you’re back online.</div>);
  }
  if (mode.kind === 'guest' && !lb.storageOk) {
    notices.push(<div className="banner warn">This browser isn’t letting the app save. Create a profile, or export your logbook so you don’t lose it.</div>);
  }
  if (mode.kind === 'account' && lb.sync.offline && lb.sync.pending > 0) {
    notices.push(
      <div className="banner" role="status">
        You’re offline.{' '}
        {lb.sync.pending === 1 ? 'Your change is kept on this device and goes' : `Your ${lb.sync.pending} changes are kept on this device and go`}{' '}
        to your profile when you’re back online.
      </div>,
    );
  }
  if (mode.kind === 'account' && !lb.storageOk) {
    notices.push(
      <div className="banner warn">
        This browser isn’t letting the app keep changes on this device. They go straight to your profile, so keep the app open until it says
        Saved.
      </div>,
    );
  }
  if (strandedCount > 0 && !hideStranded) {
    notices.push(
      <div className="banner">
        <span>
          This device has {strandedCount} {strandedCount === 1 ? 'entry' : 'entries'} saved before you signed in. Add them to your profile?
          Entries already in your profile are not duplicated.
        </span>
        <span className="row">
          <button type="button" className="btn small primary" onClick={() => void lb.moveGuestIntoAccount()}>
            Add to my profile
          </button>
          <button type="button" className="link" onClick={() => setHideStranded(true)}>
            Not now
          </button>
        </span>
      </div>,
    );
  }
  if (mode.kind === 'guest' && !mode.offline && hasContent(book) && !hideGuestNudge && tab !== 'profile') {
    notices.push(
      // The top bar's Create profile is right above it, so it needs no button of its own.
      <div className="banner">
        <span>Your logbook is only on this device. Save it to a free profile so you can’t lose it.</span>
        <button
          type="button"
          className="link"
          onClick={() => {
            snooze('guest-nudge');
            setHideGuestNudge(true);
          }}
        >
          Later
        </button>
      </div>,
    );
  }
  // Its link can't be sent offline, so it waits for the connection too.
  if (mode.kind === 'account' && !mode.confirmed && !mode.pendingEmail && !hideConfirm && !lb.sync.offline && tab !== 'profile') {
    notices.push(
      <ConfirmBanner
        lb={lb}
        email={mode.email}
        onLater={() => {
          snooze('confirm-email');
          setHideConfirm(true);
        }}
      />,
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <span>Hours to Go</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => (tab === id ? toTop() : setTab(id))}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="btn primary small topbar-log" onClick={() => startEntry('flight')}>
          <PlusIcon /> Log a flight
        </button>
        {mode.kind === 'account' ? (
          <SaveState sync={lb.sync} onClick={() => setTab('profile')} />
        ) : (
          <div className="topbar-end">
            <span className="save-state is-local">Saved on this device only</span>
            <button type="button" className="btn primary small" onClick={() => setTab('profile')}>
              Create profile
            </button>
          </div>
        )}
      </header>

      <main className={`main${tab === 'log' ? ' main-wide' : ''}`}>
        {lb.error && (
          <div className="banner danger" role="alert">
            <span>{lb.error}</span>
            <button type="button" className="link" onClick={lb.dismissError}>
              Dismiss
            </button>
          </div>
        )}
        {lb.notice && (
          <div className="banner ok slim" role="status">
            <span>{lb.notice}</span>
            <button type="button" className="link" onClick={lb.dismissNotice}>
              Dismiss
            </button>
          </div>
        )}
        {notices[0]}

        {tab === 'progress' && (
          <ProgressView
            book={book}
            updateProfile={lb.updateProfile}
            onAddHours={() => {
              setTab('log');
              startEntry('forward');
            }}
            onFly={(line) => startEntry('flight', line)}
          />
        )}
        {tab === 'log' && (
          <LogbookView
            entries={book.entries}
            onNew={startEntry}
            onEdit={editEntry}
          />
        )}
        {tab === 'profile' && <ProfileView lb={lb} />}
      </main>

      {toast ? (
        <Toast
          toast={toast}
          onDone={clearToast}
          onProgress={() => {
            setTab('progress');
            clearToast();
          }}
          onUndo={() => {
            toast.undo();
            clearToast();
          }}
        />
      ) : (
        <button type="button" className="fab" aria-label="Log a flight" onClick={() => startEntry('flight')}>
          <PlusIcon />
        </button>
      )}

      {draft && (
        <EntryForm
          key={draft.entry.id}
          initial={draft.entry}
          isNew={draft.isNew}
          layout={draft.layout}
          suggestions={suggestions}
          pplDate={book.profile.held.ppl?.date}
          onSave={saveEntry}
          onDelete={draft.isNew ? undefined : () => deleteEntry(draft.entry)}
          onLogAgain={draft.isNew || draft.entry.forward ? undefined : () => logAgain(draft.entry)}
          onClose={closeDraft}
        />
      )}
    </div>
  );
}
