import { useCallback, useMemo, useState } from 'react';
import { blankEntry, derive, isFtdOnly, type Entry } from './model/entry';
import { hasContent } from './model/store';
import { EntryForm, type FormLayout, type Suggestions } from './ui/EntryForm';
import { BookIcon, Mark, ProgressIcon, UserIcon } from './ui/icons';
import { LogbookView } from './ui/Logbook';
import { ProfileView } from './ui/Profile';
import { ProgressView } from './ui/Progress';
import { useLogbook } from './useLogbook';

type Tab = 'progress' | 'log' | 'profile';

const TABS: { id: Tab; label: string; Icon: () => JSX.Element }[] = [
  { id: 'progress', label: 'Progress', Icon: ProgressIcon },
  { id: 'log', label: 'Logbook', Icon: BookIcon },
  { id: 'profile', label: 'Profile', Icon: UserIcon },
];

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

  if (lb.mode.kind === 'loading') {
    return (
      <div className="loading" role="status">
        <Mark /> Loading your logbook…
      </div>
    );
  }

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
        <button type="button" className={`save-state${mode.kind === 'account' ? ' is-synced' : ''}`} onClick={() => setTab('profile')}>
          {mode.kind === 'account' ? 'Saved to your profile' : 'Saved on this device only'}
        </button>
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
