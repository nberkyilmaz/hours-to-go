import type { Entry } from './model/entry';
import type { Profile } from './model/profile';
import type { Logbook } from './model/store';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// Where the API is. Unset, it is the server this page came from (development, or `npm start`).
// The published page sets it: GitHub Pages serves files only, so the API runs on its own subdomain.
const API = import.meta.env.VITE_API ?? '';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  // `include`, so the session cookie also goes to an API on another subdomain.
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(API + path, init);
  } catch {
    throw new ApiError('Can’t reach the server. Check your connection and try again.', 0);
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : `Something went wrong (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

interface UserReply {
  user: { email: string };
}

export const api = {
  health: () => call<{ ok: boolean }>('GET', '/api/health'),
  me: () => call<UserReply>('GET', '/api/me'),
  signup: (email: string, password: string) => call<UserReply>('POST', '/api/auth/signup', { email, password }),
  login: (email: string, password: string) => call<UserReply>('POST', '/api/auth/login', { email, password }),
  logout: () => call<void>('POST', '/api/auth/logout'),
  forgotPassword: (email: string) => call<void>('POST', '/api/auth/forgot', { email }),
  resetPassword: (token: string, password: string) => call<UserReply>('POST', '/api/auth/reset', { token, password }),
  deleteAccount: (password: string) => call<void>('DELETE', '/api/account', { password }),
  logbook: () => call<Logbook>('GET', '/api/logbook'),
  putEntry: (entry: Entry) => call<Entry>('PUT', `/api/entries/${encodeURIComponent(entry.id)}`, entry),
  deleteEntry: (id: string) => call<void>('DELETE', `/api/entries/${encodeURIComponent(id)}`),
  putProfile: (profile: Profile) => call<Profile>('PUT', '/api/profile', profile),
  merge: (book: Logbook) => call<Logbook>('POST', '/api/logbook/merge', book),
};
