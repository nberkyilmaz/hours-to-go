import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';
import type { Entry } from './model/entry';
import type { Profile } from './model/profile';
import {
  clearGuestLogbook,
  emptyLogbook,
  hasContent,
  loadGuestLogbook,
  mergeLogbooks,
  saveGuestLogbook,
  type Logbook,
} from './model/store';

export type Mode =
  | { kind: 'loading' }
  /** `offline`: the server could not be reached, so a signed-in pilot may be looking at the guest log. */
  | { kind: 'guest'; offline: boolean }
  | { kind: 'account'; email: string };

export interface LogbookState {
  mode: Mode;
  book: Logbook;
  /** What is saved on this device as a guest. While signed in, anything here is not in the account yet. */
  guest: Logbook;
  error: string | null;
  dismissError: () => void;
  /** False when the browser will not let a guest logbook be saved. */
  storageOk: boolean;
  /** Each change shows at once and resolves true once saved, or null when saving failed (the error is in `error`). */
  saveEntry: (entry: Entry) => Promise<true | null>;
  removeEntry: (id: string) => Promise<true | null>;
  updateProfile: (fn: (p: Profile) => Profile) => Promise<true | null>;
  importLogbook: (book: Logbook) => Promise<true | null>;
  moveGuestIntoAccount: () => Promise<true | null>;
  eraseGuest: () => void;
  /** These throw an ApiError so the form can show the message next to the fields. */
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const describe = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Try again.');

/**
 * The logbook, wherever it lives. Signed in, changes show at once and are
 * saved to the server in order; if a save fails the server's copy is put back
 * and the pilot is told. As a guest, changes go to this browser.
 */
export function useLogbook(): LogbookState {
  const [mode, setModeState] = useState<Mode>({ kind: 'loading' });
  const [book, setBookState] = useState<Logbook>(loadGuestLogbook);
  const [guest, setGuest] = useState<Logbook>(loadGuestLogbook);
  const [error, setError] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const modeRef = useRef<Mode>(mode);
  const bookRef = useRef<Logbook>(book);
  // Writes go out one at a time and each reads the state the previous one left.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };

  const commit = (next: Logbook) => {
    bookRef.current = next;
    setBookState(next);
    if (modeRef.current.kind !== 'account') {
      setStorageOk(saveGuestLogbook(next));
      setGuest(next);
    }
  };

  const becomeGuest = (offline: boolean) => {
    setMode({ kind: 'guest', offline });
    const local = loadGuestLogbook();
    setGuest(local);
    commit(local);
  };

  const enterAccount = (email: string, server: Logbook) => {
    setMode({ kind: 'account', email });
    commit(server);
    setGuest(loadGuestLogbook());
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { user } = await api.me();
        const server = await api.logbook();
        if (live) enterAccount(user.email, server);
      } catch (err) {
        // 401 is simply "not signed in"; anything else means the server is out of reach.
        if (live) becomeGuest(!(err instanceof ApiError && err.status === 401));
      }
    })();
    return () => {
      live = false;
    };
    // Runs once on start; the helpers only touch refs and setters.
  }, []);

  const fail = async (err: unknown) => {
    if (err instanceof ApiError && err.status === 401 && modeRef.current.kind === 'account') {
      setError('You were signed out. Sign in again to keep saving to your profile.');
      becomeGuest(false);
      return;
    }
    setError(`${describe(err)} Your last change was not saved.`);
    // Put back what the server really has, so the screen never shows a change the profile lacks.
    // Offline, that reload fails too and the error above stays up.
    if (modeRef.current.kind === 'account') {
      try {
        commit(await api.logbook());
      } catch {
        // Still unreachable; the error banner already says the change was not saved.
      }
    }
  };

  /** Runs server work one call at a time, in the order the changes were made. */
  const run = <T,>(op: () => Promise<T>): Promise<T | null> => {
    const p = queue.current.then(op);
    queue.current = p.catch(() => undefined);
    return p.catch(async (err: unknown) => {
      await fail(err);
      return null;
    });
  };

  const signedIn = () => modeRef.current.kind === 'account';

  /**
   * Shows a change straight away, then saves it. Waiting for the server
   * before a checkbox flips feels broken on a phone at the airport, and
   * invites a second tap that undoes the first.
   */
  const change = (apply: (b: Logbook) => Logbook, save: (next: Logbook) => Promise<unknown>): Promise<true | null> => {
    const next = apply(bookRef.current);
    commit(next);
    if (!signedIn()) return Promise.resolve(true);
    return run(async () => {
      await save(next);
      return true as const;
    });
  };

  const saveEntry = (entry: Entry) =>
    change(
      (b) => ({
        ...b,
        entries: b.entries.some((e) => e.id === entry.id) ? b.entries.map((e) => (e.id === entry.id ? entry : e)) : [...b.entries, entry],
      }),
      () => api.putEntry(entry),
    );

  const removeEntry = (id: string) =>
    change(
      (b) => ({ ...b, entries: b.entries.filter((e) => e.id !== id) }),
      () => api.deleteEntry(id),
    );

  const updateProfile = (fn: (p: Profile) => Profile) =>
    change(
      (b) => ({ ...b, profile: fn(b.profile) }),
      (next) => api.putProfile(next.profile),
    );

  const importLogbook = (incoming: Logbook) =>
    run(async () => {
      commit(signedIn() ? await api.merge(incoming) : mergeLogbooks(bookRef.current, incoming));
      return true as const;
    });

  const moveGuestIntoAccount = () =>
    run(async () => {
      const merged = await api.merge(loadGuestLogbook());
      clearGuestLogbook();
      setGuest(emptyLogbook());
      commit(merged);
      return true as const;
    });

  const eraseGuest = () => {
    if (!signedIn()) commit(emptyLogbook());
  };

  const signUp = async (email: string, password: string) => {
    const { user } = await api.signup(email, password);
    const local = loadGuestLogbook();
    // A new profile starts with whatever was logged on this device.
    const server = hasContent(local) ? await api.merge(local) : await api.logbook();
    if (hasContent(local)) clearGuestLogbook();
    enterAccount(user.email, server);
  };

  const signIn = async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    enterAccount(user.email, await api.logbook());
  };

  const signOut = async () => {
    await api.logout();
    becomeGuest(false);
  };

  const deleteAccount = async (password: string) => {
    await api.deleteAccount(password);
    becomeGuest(false);
  };

  return {
    mode,
    book,
    guest,
    error,
    dismissError: () => setError(null),
    storageOk,
    saveEntry,
    removeEntry,
    updateProfile,
    importLogbook,
    moveGuestIntoAccount,
    eraseGuest,
    signUp,
    signIn,
    signOut,
    deleteAccount,
  };
}
