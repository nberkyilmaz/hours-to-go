import { useCallback, useEffect, useMemo, useState } from 'react';
import { blankEntry, derive, isFtdOnly, type Entry } from './model/entry';
import { hasContent } from './model/store';
import { EntryForm, type FormLayout, type Suggestions } from './ui/EntryForm';
import { BookIcon, CloudCheckIcon, Mark, ProgressIcon, UserIcon } from './ui/icons';
import { LogbookView } from './ui/Logbook';
import { ProfileView } from './ui/Profile';
import { ProgressView } from './ui/Progress';
import { Welcome } from './ui/Welcome';
import { useLogbook } from './useLogbook';

type Tab = 'progress' | 'log' | 'profile';

const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'progress', label: 'Progress', Icon: ProgressIcon },
  { id: 'log', label: 'Logbook', Icon: BookIcon },
  { id: 'profile', label: 'Profile', Icon: UserIcon },
];

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

export function App() {
  const lb = useLogbook();
  const [tab, setTab] = useState<Tab>('progress');
  const [draft, setDraft] = useState<{ entry: Entry; isNew: boolean; layout: FormLayout } | null>(null);
  const [hideGuestNudge, setHideGuestNudge] = useState(false);
  const [hideStranded, setHideStranded] = useState(false);
  const entries = lb.book.entries;

  const suggestions = useMemo((): Suggestions => {
    const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort();
    return {
      aircraft: uniq(entries.map((e) => e.aircraft)),
      registrations: uniq(entries.map((e) => e.registration)),
      places: uniq(entries.flatMap((e) => [e.from, e.to])),
    };
  }, [entries]);

  const closeDraft = useCallback(() => setDraft(null), []);
  const startEntry = (layout: FormLayout) => {
    const entry = blankEntry(layout === 'forward');
    const newest = [...entries].filter((e) => !e.forward).sort((a, b) => (a.date < b.date ? 1 : -1));
    // Most students fly the same aircraft from the same field, so start from the last one.
    const last = newest.find((e) => (layout === 'ftd' ? isFtdOnly(e) : derive(e).total > 0));
    if (last && layout === 'flight') Object.assign(entry, { aircraft: last.aircraft, registration: last.registration, from: last.from });
    if (last && layout === 'ftd') entry.aircraft = last.aircraft;
    setDraft({ entry, isNew: true, layout });
  };
  const editEntry = (entry: Entry) =>
    setDraft({ entry, isNew: false, layout: entry.forward ? 'forward' : isFtdOnly(entry) ? 'ftd' : 'flight' });

  // A first visit, with nothing logged yet: recommend a profile before anything else.
  const welcoming = lb.mode.kind === 'guest' && !lb.mode.offline && !lb.welcomed && !hasContent(lb.guest);
  // The welcome's buttons are low on a phone, so the app it gives way to would open scrolled.
  useEffect(toTop, [welcoming, tab]);

  if (lb.mode.kind === 'loading') return <Loading />;
  if (welcoming) return <Welcome lb={lb} />;

  const { mode, book } = lb;
  const strandedCount = mode.kind === 'account' && hasContent(lb.guest) ? lb.guest.entries.length : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <span>Hours to Go</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {mode.kind === 'account' ? (
          <button type="button" className="save-state" onClick={() => setTab('profile')}>
            <CloudCheckIcon /> Saved to your profile
          </button>
        ) : (
          <div className="topbar-end">
            <span className="save-state is-local">Saved on this device only</span>
            <button type="button" className="btn primary small" onClick={() => setTab('profile')}>
              Create profile
            </button>
          </div>
        )}
      </header>

      <main className="main">
        {lb.error && (
          <div className="banner danger" role="alert">
            <span>{lb.error}</span>
            <button type="button" className="link" onClick={lb.dismissError}>
              Dismiss
            </button>
          </div>
        )}
        {mode.kind === 'guest' && mode.offline && (
          <div className="banner warn">Can’t reach the server. You’re working on this device only; sign in again once you’re back online.</div>
        )}
        {mode.kind === 'guest' && !lb.storageOk && (
          <div className="banner warn">This browser isn’t letting the app save. Create a profile, or export your logbook so you don’t lose it.</div>
        )}
        {mode.kind === 'guest' && !mode.offline && hasContent(book) && !hideGuestNudge && tab !== 'profile' && (
          <div className="banner">
            <span>Your logbook is only on this device. Create a free profile so you don’t lose it and can use it on your phone too.</span>
            <span className="row">
              <button type="button" className="btn small primary" onClick={() => setTab('profile')}>
                Create profile
              </button>
              <button type="button" className="link" onClick={() => setHideGuestNudge(true)}>
                Later
              </button>
            </span>
          </div>
        )}
        {strandedCount > 0 && !hideStranded && (
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
          </div>
        )}

        {tab === 'progress' && (
          <ProgressView
            book={book}
            updateProfile={lb.updateProfile}
            onAddHours={() => {
              setTab('log');
              startEntry('forward');
            }}
          />
        )}
        {tab === 'log' && (
          <LogbookView
            entries={book.entries}
            onNew={startEntry}
            onEdit={editEntry}
            onDelete={(entry) => {
              if (window.confirm(`Delete the ${entry.date} entry?`)) void lb.removeEntry(entry.id);
            }}
          />
        )}
        {tab === 'profile' && <ProfileView lb={lb} />}
      </main>

      {draft && (
        <EntryForm
          key={draft.entry.id}
          initial={draft.entry}
          isNew={draft.isNew}
          layout={draft.layout}
          suggestions={suggestions}
          pplDate={book.profile.held.ppl?.date}
          onSave={lb.saveEntry}
          onClose={closeDraft}
        />
      )}
    </div>
  );
}
