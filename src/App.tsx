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
import { PrintLog } from './ui/PrintLog';
import { ResetPassword } from './ui/ResetPassword';
import { Shared } from './ui/Shared';
import { StopReminders } from './ui/StopReminders';
import { Welcome } from './ui/Welcome';
import { useLogbook, type Sync } from './useLogbook';
import { dateFormat, t } from './i18n';
import { clearClock, clockHours, clockMinutes, clockStart, startClock } from './model/clock';

type Tab = 'progress' | 'log' | 'profile';

const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'progress', label: t('Progress'), Icon: ProgressIcon },
  { id: 'log', label: t('Logbook'), Icon: BookIcon },
  { id: 'profile', label: t('Profile'), Icon: UserIcon },
];

/** An emailed link: to reset a password, confirm an address, or stop reminders. It opens the page at `#reset=…`, `#confirm=…` or `#stop=…`. */
interface EmailedLink {
  kind: 'reset' | 'confirm' | 'stop' | 'share';
  token: string;
}

function linkInUrl(): EmailedLink | null {
  const found = /^#(reset|confirm|stop|share)=([\w-]+)$/.exec(window.location.hash);
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
      <span className="loading-title">{t('Loading your logbook…')}</span>
      {slow && <span>{t('If nobody has opened Hours to Go for a while, its server takes up to a minute to wake up.')}</span>}
    </div>
  );
}

const changes = (n: number) => (n === 1 ? t('1 change') : t('{n} changes', { n }));

/**
 * Signed in: whether the profile has everything (D41). On a phone it says only "Saved", "Saving…"
 * or "Offline", so the name keeps to one line; the label still says all of it.
 */
function SaveState({ sync, onClick }: { sync: Sync; onClick: () => void }) {
  if (sync.offline) {
    const label = sync.pending > 0 ? t('Offline. {changes} kept on this device', { changes: changes(sync.pending) }) : t('Offline');
    return (
      <button type="button" className="save-state is-offline" aria-label={label} onClick={onClick}>
        {/* No wider than "Saved to your profile", so going offline doesn't move the top bar. */}
        <CloudOffIcon />{' '}{t('Offline')}<span className="save-more">{sync.pending > 0 ? ` · ${t('{n} to save', { n: sync.pending })}` : ''}</span>
      </button>
    );
  }
  if (sync.pending > 0) {
    return (
      <button type="button" className="save-state is-saving" aria-label={t('Saving to your profile')} onClick={onClick}>
        <CloudUpIcon />{' '}{t('Saving')}<span className="save-more">{' '}{t('to your profile')}</span>…
      </button>
    );
  }
  return (
    <button type="button" className="save-state" aria-label={t('Saved to your profile')} onClick={onClick}>
      <CloudCheckIcon />{' '}{t('Saved')}<span className="save-more">{' '}{t('to your profile')}</span>
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
            {t('See progress')}
          </button>
        )}
        <button type="button" className="link" onClick={onUndo}>
          {t('Undo')}
        </button>
      </span>
    </div>
  );
}

/** Past this, it was more likely left running than flown. */
const CLOCK_FORGOTTEN = 12 * 60;

/** A flight in progress (D59). On every tab, because it's the first thing a pilot needs on landing. */
function FlightClock({ start, onLanded, onCancel }: { start: number; onLanded: () => void; onCancel: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const minutes = clockMinutes(start);
  const time = dateFormat({ hour: 'numeric', minute: '2-digit' }).format(new Date(start));
  const elapsed = `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  const forgotten = minutes > CLOCK_FORGOTTEN;
  return (
    <div className={`banner flight-clock${forgotten ? ' warn' : ''}`} role="timer">
      <span>{forgotten ? t('The flight clock has been running since {time}, over 12 hours. Forgot to stop it?', { time }) : t('Flight clock: {elapsed}, since {time}', { elapsed, time })}</span>
      <span className="row">
        <button type="button" className="btn primary small" onClick={onLanded}>
          {t('Landed')}
        </button>
        <button type="button" className="link" onClick={onCancel}>
          {t('Cancel the clock')}
        </button>
      </span>
    </div>
  );
}

export function App() {
  const lb = useLogbook();
  const [tab, setTab] = useState<Tab>('progress');
  // `clockTime` is the time from the flight clock, when that's where this line came from.
  const [draft, setDraft] = useState<{ entry: Entry; isNew: boolean; layout: FormLayout; clockTime?: string } | null>(null);
  const [clock, setClock] = useState<number | null>(clockStart);
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

  // Out of the address bar and the history once read, so the link isn't bookmarked or shared. Except
  // a read-only link, which an instructor is meant to come back to.
  useEffect(() => {
    if (link && link.kind !== 'share') window.history.replaceState(null, '', window.location.pathname + window.location.search);
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
  const startEntry = (layout: FormLayout, filled?: Partial<Entry>, clockTime?: string) => {
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
    setDraft({ entry, isNew: true, layout, ...(clockTime ? { clockTime } : {}) });
  };
  const stopClock = () => {
    clearClock();
    setClock(null);
  };
  /** Nothing is stopped yet: if the form is cancelled, the time is still there. */
  const landed = () => {
    if (clock !== null) startEntry('flight', { date: today(new Date(clock)) }, clockHours(clockMinutes(clock)));
  };
  /** The same flight again: students fly the same lesson many times. */
  const logAgain = (e: Entry) => setDraft({ entry: { ...e, id: newId(), date: today(), remarks: '' }, isNew: true, layout: isFtdOnly(e) ? 'ftd' : 'flight' });
  const editEntry = (entry: Entry) =>
    setDraft({ entry, isNew: false, layout: entry.forward ? 'forward' : isFtdOnly(entry) ? 'ftd' : 'flight' });

  const saveEntry = async (entry: Entry) => {
    const isNew = draft?.isNew === true;
    const moment = isNew ? momentOf(goalById(lb.book.profile.focus), entries, entry, lb.book.profile, today()) : null;
    const ok = await lb.saveEntry(entry);
    if (ok && draft?.clockTime) stopClock();
    if (ok && isNew) {
      const d = derive(entry);
      setToast({
        text: (
          <>
            <strong>{formatHours(d.total || entry.ftd)}{' '}{t('h logged.')}</strong>
            {moment?.firstSolo && t(' Your first solo. Congratulations!')}
            {moment?.complete ? ` ${t('Every {goal} requirement is met.', { goal: moment.short })}` : moment && moment.now < moment.was ? ` ${t('{goal}: {now} h to go, was {was}.', { goal: moment.short, now: formatHoursUp(moment.now), was: formatHoursUp(moment.was) })}` : ''}
            {moment?.halfway && !moment.complete && t(' Halfway there.')}
            {moment && moment.finished.length > 0 && !moment.complete ? ` ${t('Done: {what}.', { what: t(moment.finished[0]!) })}` : ''}
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
      text: <>{t('Deleted the')}{' '}{[entry.date, entry.aircraft, entry.registration].filter(Boolean).join(' ')}{' '}{t('entry.')}</>,
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
    if (!ready || (hash !== '#log' && hash !== '#start')) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setHash('');
    if (hash === '#start') {
      setClock((running) => running ?? startClock());
      return;
    }
    startEntry('flight');
    // Only when the app has come up; startEntry reads the logbook of the moment.
  }, [ready, hash]);

  if (link?.kind === 'reset') return <ResetPassword token={link.token} lb={lb} onDone={() => setLink(null)} />;
  if (link?.kind === 'confirm') return <ConfirmEmail token={link.token} lb={lb} onDone={() => setLink(null)} />;
  if (link?.kind === 'stop') return <StopReminders token={link.token} lb={lb} onDone={() => setLink(null)} />;
  if (link?.kind === 'share') {
    const leave = () => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setLink(null);
    };
    return <Shared token={link.token} onDone={leave} />;
  }
  if (lb.mode.kind === 'loading') return <Loading />;
  if (welcoming) return <Welcome lb={lb} />;
  if (hash === '#print') return <PrintLog entries={entries} onBack={() => window.history.back()} />;

  const { mode, book } = lb;
  const strandedCount = mode.kind === 'account' && hasContent(lb.guest) ? lb.guest.entries.length : 0;

  // One notice at a time, the most pressing first: a stack of them pushed the app off the first screen.
  const notices: JSX.Element[] = [];
  if (mode.kind === 'guest' && mode.offline) {
    notices.push(<div className="banner warn">{t('Can’t reach the server. You’re working on this device only; sign in again once you’re back online.')}</div>);
  }
  if (mode.kind === 'guest' && !lb.storageOk) {
    notices.push(<div className="banner warn">{t('This browser isn’t letting the app save. Create a profile, or export your logbook so you don’t lose it.')}</div>);
  }
  if (mode.kind === 'account' && lb.sync.offline && lb.sync.pending > 0) {
    notices.push(
      <div className="banner" role="status">
        {t('You’re offline.')}{' '}
        {lb.sync.pending === 1 ? t('Your change is kept on this device and goes') : t('Your {n} changes are kept on this device and go', { n: lb.sync.pending })}{' '}
        {t('to your profile when you’re back online.')}
      </div>,
    );
  }
  if (mode.kind === 'account' && !lb.storageOk) {
    notices.push(
      <div className="banner warn">
        {t('This browser isn’t letting the app keep changes on this device. They go straight to your profile, so keep the app open until it says Saved.')}
      </div>,
    );
  }
  if (strandedCount > 0 && !hideStranded) {
    notices.push(
      <div className="banner">
        <span>
          {strandedCount === 1 ? t('This device has 1 entry') : t('This device has {n} entries', { n: strandedCount })}{' '}{t('saved before you signed in. Add them to your profile? Entries already in your profile are not duplicated.')}
        </span>
        <span className="row">
          <button type="button" className="btn small primary" onClick={() => void lb.moveGuestIntoAccount()}>
            {t('Add to my profile')}
          </button>
          <button type="button" className="link" onClick={() => setHideStranded(true)}>
            {t('Not now')}
          </button>
        </span>
      </div>,
    );
  }
  if (mode.kind === 'guest' && !mode.offline && hasContent(book) && !hideGuestNudge && tab !== 'profile') {
    notices.push(
      // The top bar's Create profile is right above it, so it needs no button of its own.
      <div className="banner">
        <span>{t('Your logbook is only on this device. Save it to a free profile so you can’t lose it.')}</span>
        <button
          type="button"
          className="link"
          onClick={() => {
            snooze('guest-nudge');
            setHideGuestNudge(true);
          }}
        >
          {t('Later')}
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
          <span>{t('Hours to Go')}</span>
        </div>
        <nav className="tabs" aria-label={t('Sections')}>
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => (tab === id ? toTop() : setTab(id))}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="btn primary small topbar-log" onClick={() => startEntry('flight')}>
          <PlusIcon />{' '}{t('Log a flight')}
        </button>
        {mode.kind === 'account' ? (
          <SaveState sync={lb.sync} onClick={() => setTab('profile')} />
        ) : (
          <div className="topbar-end">
            <span className="save-state is-local">{t('Saved on this device only')}</span>
            <button type="button" className="btn primary small" onClick={() => setTab('profile')}>
              {t('Create profile')}
            </button>
          </div>
        )}
      </header>

      <main className={`main${tab === 'log' ? ' main-wide' : ''}`}>
        {lb.error && (
          <div className="banner danger" role="alert">
            <span>{lb.error}</span>
            <button type="button" className="link" onClick={lb.dismissError}>
              {t('Dismiss')}
            </button>
          </div>
        )}
        {lb.notice && (
          <div className="banner ok slim" role="status">
            <span>{lb.notice}</span>
            <button type="button" className="link" onClick={lb.dismissNotice}>
              {t('Dismiss')}
            </button>
          </div>
        )}
        {clock !== null && <FlightClock start={clock} onLanded={landed} onCancel={stopClock} />}
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
        <button type="button" className="fab" aria-label={t('Log a flight')} onClick={() => startEntry('flight')}>
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
          clockTime={draft.clockTime}
          onStartClock={draft.isNew && draft.layout === 'flight' && clock === null ? () => setClock(startClock()) : undefined}
          onClose={closeDraft}
        />
      )}
    </div>
  );
}
