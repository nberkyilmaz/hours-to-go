import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type Account } from './api';
import type { Entry } from './model/entry';
import type { Profile } from './model/profile';
import {
  clearGuestLogbook,
  emptyLogbook,
  hasContent,
  loadGuestLogbook,
  mergeLogbooks,
  rememberSignedIn,
  rememberWelcomed,
  saveGuestLogbook,
  wasSignedIn,
  wasWelcomed,
  type Logbook,
} from './model/store';
import { applyChanges, applyOps, clearCopy, loadCopy, profileChanges, saveCopy, type AccountCopy, type Op } from './model/sync';

export type Mode =
  | { kind: 'loading' }
  /** `offline`: the server could not be reached, so a signed-in pilot may be looking at the guest log. */
  | { kind: 'guest'; offline: boolean }
  | ({ kind: 'account' } & Account);

/** Signed in: how far the server is behind this device (D41). */
export interface Sync {
  /** Changes kept on this device that the profile doesn't have yet. */
  pending: number;
  /** The last try to reach the server failed, so the changes wait for the connection. */
  offline: boolean;
}

export interface LogbookState {
  mode: Mode;
  book: Logbook;
  sync: Sync;
  /** What is saved on this device as a guest. While signed in, anything here is not in the account yet. */
  guest: Logbook;
  error: string | null;
  dismissError: () => void;
  /** Good news worth a line: what an account action just did. */
  notice: string | null;
  dismissNotice: () => void;
  /** False when the browser will not let the logbook be kept on this device. */
  storageOk: boolean;
  /** False until this browser has signed in or chosen to go on without a profile. */
  welcomed: boolean;
  skipWelcome: () => void;
  /** Each change shows at once and resolves true once kept, or null when it could not be (the error is in `error`). */
  saveEntry: (entry: Entry) => Promise<true | null>;
  removeEntry: (id: string) => Promise<true | null>;
  updateProfile: (fn: (p: Profile) => Profile) => Promise<true | null>;
  importLogbook: (book: Logbook) => Promise<true | null>;
  moveGuestIntoAccount: () => Promise<true | null>;
  eraseGuest: () => void;
  /** These throw an ApiError so the form can show the message next to the fields. */
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /** Sets a new password with the token from an emailed link, and signs in with it. */
  resetPassword: (token: string, password: string) => Promise<void>;
  /** Spends a link that confirms an address, which needs no sign-in. */
  confirmEmail: (token: string) => Promise<{ email: string; changed: boolean }>;
  sendConfirmation: () => Promise<void>;
  /** The new address takes over once the link sent to it is opened. */
  changeEmail: (email: string, password: string) => Promise<void>;
  cancelEmailChange: () => Promise<void>;
  changePassword: (password: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const describe = (err: unknown) => (err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
/** Out of reach, or the server failing for now: worth trying again later. */
const unreachable = (err: unknown) => !(err instanceof ApiError) || err.status === 0 || err.status >= 500;
/** How often changes still waiting are tried again; coming back online or to the app tries at once. */
const RETRY_MS = 30_000;

/**
 * The logbook, wherever it lives. As a guest, changes go to this browser. Signed in, each change
 * shows at once, is kept on this device, and goes to the server in order; with no connection it
 * waits and goes once there is one (D41).
 */
export function useLogbook(): LogbookState {
  // Signed in here before: open on this device's copy at once, rather than wait for a server that
  // may be asleep or out of reach.
  const [opening] = useState(() => (wasSignedIn() ? loadCopy() : null));
  const [mode, setModeState] = useState<Mode>(() =>
    opening ? { kind: 'account', ...opening.account } : wasSignedIn() ? { kind: 'loading' } : { kind: 'guest', offline: false },
  );
  const [book, setBookState] = useState<Logbook>(() => (opening ? applyOps(opening.server, opening.ops) : loadGuestLogbook()));
  const [sync, setSync] = useState<Sync>({ pending: opening?.ops.length ?? 0, offline: false });
  const [guest, setGuest] = useState<Logbook>(loadGuestLogbook);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  // A browser that signed in before the welcome screen existed has been here already.
  const [welcomed, setWelcomed] = useState(() => wasWelcomed() || wasSignedIn());
  const modeRef = useRef<Mode>(mode);
  const bookRef = useRef<Logbook>(book);
  const copyRef = useRef<AccountCopy | null>(opening);
  // Whether the copy may be behind the server: another device may have saved since. Fetched again
  // before the next change is sent.
  const stale = useRef(opening !== null);
  const flushing = useRef(false);
  // Imports and sign-in moves go out one at a time and each reads the state the previous one left.
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

  /** Keeps the copy on this device and shows the server's logbook with the waiting changes on top. */
  const keep = (copy: AccountCopy, show = true) => {
    copyRef.current = copy;
    setStorageOk(saveCopy(copy));
    setSync((s) => ({ ...s, pending: copy.ops.length }));
    if (show) commit(applyOps(copy.server, copy.ops));
  };

  const becomeGuest = (offline: boolean) => {
    // Unreachable is not signed out: the session may still be good once the server answers.
    if (!offline) rememberSignedIn(false);
    // Signed out with changes still waiting, the copy stays on this device for signing in again.
    copyRef.current = null;
    setSync({ pending: 0, offline: false });
    setMode({ kind: 'guest', offline });
    const local = loadGuestLogbook();
    setGuest(local);
    commit(local);
  };

  /** The session ended without signing out here: the copy stays only if changes in it still need sending. */
  const signedOutHere = () => {
    const copy = copyRef.current;
    if (copy && copy.ops.length === 0) clearCopy(copy.account.email);
    becomeGuest(false);
  };

  const skipWelcome = () => {
    rememberWelcomed();
    setWelcomed(true);
  };

  /** `waiting`: changes made on this device for this profile that the server doesn't have yet. */
  const enterAccount = (account: Account, server: Logbook, waiting: Op[]) => {
    rememberSignedIn(true);
    skipWelcome();
    setMode({ kind: 'account', ...account });
    stale.current = false;
    keep({ account, server, ops: waiting });
    setGuest(loadGuestLogbook());
    void flush();
  };

  /** What the server now says about the signed-in profile's address. */
  const showAccount = (account: Account) => {
    if (modeRef.current.kind !== 'account') return;
    setMode({ kind: 'account', ...account });
    const copy = copyRef.current;
    if (!copy) return;
    if (copy.account.email !== account.email) clearCopy(copy.account.email);
    keep({ ...copy, account }, false);
  };

  /** The server's logbook, with whatever is still waiting here on top. */
  const fromServer = (server: Logbook) => {
    const copy = copyRef.current;
    if (copy) keep({ ...copy, server });
    else commit(server);
  };

  /**
   * Sends the waiting changes, oldest first, until none are left or the server can't be reached.
   * One run at a time; a change made while it runs is picked up by it.
   */
  const flush = async (): Promise<void> => {
    if (flushing.current) return;
    flushing.current = true;
    let sending: Op[] = [];
    let again = false;
    try {
      for (let copy = copyRef.current; copy && modeRef.current.kind === 'account'; copy = copyRef.current) {
        if (stale.current) {
          const server = await api.logbook();
          stale.current = false;
          setSync((s) => ({ ...s, offline: false }));
          fromServer(server);
          continue;
        }
        const op = copy.ops[0];
        if (!op) break;
        let saved: Profile | null = null;
        if (op.kind === 'profile') {
          // Every profile change waiting goes in one save, on top of the profile the server has.
          const end = copy.ops.findIndex((o) => o.kind !== 'profile');
          sending = copy.ops.slice(0, end === -1 ? undefined : end);
          const changes = sending.flatMap((o) => (o.kind === 'profile' ? o.changes : []));
          saved = await api.putProfile(applyChanges(copy.server.profile, changes));
        } else {
          sending = [op];
          if (op.kind === 'entry') await api.putEntry(op.entry);
          else await api.deleteEntry(op.id);
        }
        // Changes are only ever added at the end, so the ones sent are still at the start. The
        // server's copy may have been fetched again meanwhile, so the change goes on the newest.
        const now = copyRef.current;
        if (!now || now.account.email !== copy.account.email) break;
        const server = saved ? { ...now.server, profile: saved } : applyOps(now.server, sending);
        keep({ ...now, server, ops: now.ops.slice(sending.length) }, false);
        sending = [];
        setSync((s) => ({ ...s, offline: false }));
      }
    } catch (err) {
      const copy = copyRef.current;
      if (err instanceof ApiError && err.status === 401) {
        const n = copy?.ops.length ?? 0;
        setError(
          n > 0
            ? `You were signed out. Sign in again to save the ${n === 1 ? 'change' : `${n} changes`} made on this device.`
            : 'You were signed out. Sign in again to keep saving to your profile.',
        );
        signedOutHere();
      } else if (unreachable(err) || sending.length === 0) {
        // It waits here; the server is asked for its copy again first, as another device may have saved.
        stale.current = true;
        setSync((s) => ({ ...s, offline: true }));
      } else if (copy) {
        // Refused: sending it again won't help. Say so, drop it, and show what the profile has.
        setError(`${describe(err)} That change was not saved.`);
        keep({ ...copy, ops: copy.ops.slice(sending.length) });
        stale.current = true;
        again = true;
      }
    } finally {
      flushing.current = false;
    }
    if (again) void flush();
  };

  useEffect(() => {
    // Never signed in here: already a guest, and no reason to wake the server.
    if (!wasSignedIn()) return;
    let live = true;
    (async () => {
      try {
        const { user } = await api.me();
        const server = await api.logbook();
        // The session is this device's profile, even if its address changed elsewhere.
        const copy = copyRef.current;
        if (copy && copy.account.email !== user.email) clearCopy(copy.account.email);
        if (live) enterAccount(user, server, copy?.ops ?? []);
      } catch (err) {
        if (!live) return;
        // 401 is "not signed in"; anything else means the server is out of reach.
        const out = unreachable(err);
        if (out && copyRef.current) {
          // Working from this device's copy until the connection comes back.
          setSync((s) => ({ ...s, offline: true }));
          return;
        }
        const n = copyRef.current?.ops.length ?? 0;
        if (n > 0) setError(`You were signed out. Sign in again to save the ${n === 1 ? 'change' : `${n} changes`} made on this device.`);
        if (out) becomeGuest(true);
        else signedOutHere();
      }
    })();
    return () => {
      live = false;
    };
    // Runs once on start; the helpers only touch refs and setters.
  }, []);

  useEffect(() => {
    const retry = () => {
      if (document.visibilityState === 'hidden' || modeRef.current.kind !== 'account') return;
      if (copyRef.current?.ops.length || stale.current) void flush();
    };
    const timer = window.setInterval(retry, RETRY_MS);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
    // Set up once; the retry reads refs.
  }, []);

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401 && modeRef.current.kind === 'account') {
      setError('You were signed out. Sign in again to keep saving to your profile.');
      signedOutHere();
      return;
    }
    setError(`${describe(err)} Your last change was not saved.`);
    // Show what the server really has once it answers, with this device's waiting changes on top.
    if (modeRef.current.kind === 'account') {
      stale.current = true;
      void flush();
    }
  };

  /** Runs server work one call at a time, in the order it was asked for. */
  const run = <T,>(op: () => Promise<T>): Promise<T | null> => {
    const p = queue.current.then(op);
    queue.current = p.catch(() => undefined);
    return p.catch((err: unknown) => {
      fail(err);
      return null;
    });
  };

  const signedIn = () => modeRef.current.kind === 'account';

  /**
   * Shows a change straight away and keeps it. Waiting for the server before a checkbox flips
   * feels broken on a phone at the airport, and invites a second tap that undoes the first.
   */
  const change = (op: Op): Promise<true | null> => {
    const copy = copyRef.current;
    if (!signedIn() || !copy) {
      commit(applyOps(bookRef.current, [op]));
      return Promise.resolve(true);
    }
    keep({ ...copy, ops: [...copy.ops, op] });
    void flush();
    return Promise.resolve(true);
  };

  const saveEntry = (entry: Entry) => change({ kind: 'entry', entry });
  const removeEntry = (id: string) => change({ kind: 'delete', id });

  const updateProfile = (fn: (p: Profile) => Profile) => {
    const before = bookRef.current.profile;
    const after = fn(before);
    if (!signedIn()) {
      commit({ ...bookRef.current, profile: after });
      return Promise.resolve(true as const);
    }
    const changes = profileChanges(before, after);
    return changes.length > 0 ? change({ kind: 'profile', changes }) : Promise.resolve(true as const);
  };

  const importLogbook = (incoming: Logbook) =>
    run(async () => {
      if (signedIn()) fromServer(await api.merge(incoming));
      else commit(mergeLogbooks(bookRef.current, incoming));
      return true as const;
    });

  const moveGuestIntoAccount = () =>
    run(async () => {
      const merged = await api.merge(loadGuestLogbook());
      clearGuestLogbook();
      setGuest(emptyLogbook());
      fromServer(merged);
      return true as const;
    });

  const eraseGuest = () => {
    if (!signedIn()) commit(emptyLogbook());
  };

  /** Changes made on this device for `email` before it was signed out, still to send. */
  const waitingFor = (email: string) => loadCopy(email)?.ops ?? [];

  const signUp = async (email: string, password: string) => {
    const { user } = await api.signup(email, password);
    const local = loadGuestLogbook();
    // A new profile starts with whatever was logged on this device.
    const server = hasContent(local) ? await api.merge(local) : await api.logbook();
    if (hasContent(local)) clearGuestLogbook();
    enterAccount(user, server, []);
    const n = local.entries.length;
    if (n > 0) setNotice(`${n === 1 ? 'The entry' : `All ${n} entries`} from this device ${n === 1 ? 'is' : 'are'} in your new profile.`);
  };

  const signIn = async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    enterAccount(user, await api.logbook(), waitingFor(user.email));
  };

  const resetPassword = async (token: string, password: string) => {
    const { user } = await api.resetPassword(token, password);
    enterAccount(user, await api.logbook(), waitingFor(user.email));
  };

  const confirmEmail = async (token: string) => {
    const result = await api.confirmEmail(token);
    // The link may be for another profile than the one signed in here, so ask rather than assume.
    if (modeRef.current.kind === 'account') {
      try {
        showAccount((await api.me()).user);
      } catch {
        // It shows the next time the app opens.
      }
    }
    return result;
  };

  const changeEmail = async (email: string, password: string) => showAccount((await api.changeEmail(email, password)).user);
  const cancelEmailChange = async () => showAccount((await api.cancelEmailChange()).user);

  const signOut = async () => {
    // Signing out takes the profile off this device, so anything waiting goes first.
    await flush();
    const copy = copyRef.current;
    if (copy && copy.ops.length > 0) {
      throw new ApiError('Some changes aren’t in your profile yet. Sign out once you’re back online and they’ve been saved.', 0);
    }
    await api.logout();
    if (copy) clearCopy(copy.account.email);
    becomeGuest(false);
  };

  const deleteAccount = async (password: string) => {
    await api.deleteAccount(password);
    const copy = copyRef.current;
    if (copy) clearCopy(copy.account.email);
    becomeGuest(false);
    setNotice('Your profile is deleted, along with every entry in it.');
  };

  return {
    mode,
    book,
    sync,
    guest,
    error,
    dismissError: () => setError(null),
    notice,
    dismissNotice: () => setNotice(null),
    storageOk,
    welcomed,
    skipWelcome,
    saveEntry,
    removeEntry,
    updateProfile,
    importLogbook,
    moveGuestIntoAccount,
    eraseGuest,
    signUp,
    signIn,
    resetPassword,
    confirmEmail,
    sendConfirmation: api.sendConfirmation,
    changeEmail,
    cancelEmailChange,
    changePassword: api.changePassword,
    signOut,
    deleteAccount,
  };
}
