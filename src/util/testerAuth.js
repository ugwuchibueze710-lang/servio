/**
 * src/util/testerAuth.js
 *
 * Client for the temporary, no-email "tester" sign up / log in flow - see
 * server/api/v2/testerAuth/*.js and server/state/testerAccounts.js for the backend side. Kept
 * completely separate from src/util/apiV2.js's AppUser-bridge token (a different, longer-lived
 * system tied to MongoDB) so the two can never be confused with each other.
 */
import { apiBaseUrl } from './api';

const isBrowser = typeof window !== 'undefined';
const TOKEN_KEY = 'servio.testerSessionToken';
const USER_KEY = 'servio.testerSessionUser';

const safeGetItem = key => {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    // Storage can be unavailable (private browsing, disabled storage) - not fatal, the session
    // just won't survive a page reload.
    return null;
  }
};

const safeSetItem = (key, value) => {
  if (!isBrowser) return;
  try {
    if (value == null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {
    // See safeGetItem above.
  }
};

/** Read back a still-valid tester session from localStorage, or null if there isn't one. */
export const getStoredTesterSession = () => {
  const token = safeGetItem(TOKEN_KEY);
  const rawUser = safeGetItem(USER_KEY);
  if (!token || !rawUser) return null;

  let user;
  try {
    user = JSON.parse(rawUser);
  } catch (e) {
    return null;
  }

  if (user && user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) {
    // Locally expired already - no point handing back a session that the server has (or will
    // have) forgotten too. Doesn't bother clearing storage here; the next signup overwrites it.
    return null;
  }

  return { token, user };
};

/** Forget the current tester session in this browser (does not need a network round trip). */
export const clearTesterSession = () => {
  safeSetItem(TOKEN_KEY, null);
  safeSetItem(USER_KEY, null);
};

const storeTesterSession = ({ token, user }) => {
  safeSetItem(TOKEN_KEY, token);
  safeSetItem(USER_KEY, JSON.stringify(user));
};

const jsonRequest = async (path, { method = 'GET', body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await window.fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    const error = new Error((data && data.message) || 'Something went wrong. Please try again.');
    error.status = res.status;
    error.code = data && data.error;
    throw error;
  }
  return data;
};

/** Create a new temporary tester account and remember it in this browser. */
export const testerSignup = async ({ name, role }) => {
  const data = await jsonRequest('/api/v2/tester-auth/signup', {
    method: 'POST',
    body: { name, role },
  });
  storeTesterSession(data);
  return data;
};

/** Delete the tester account server-side (best-effort) and forget it locally. */
export const testerLogout = async () => {
  const session = getStoredTesterSession();
  clearTesterSession();
  if (session) {
    try {
      await jsonRequest('/api/v2/tester-auth/logout', { method: 'POST', token: session.token });
    } catch (e) {
      // Already cleared locally - a failed network call here doesn't change anything for the
      // person using the app.
    }
  }
};
