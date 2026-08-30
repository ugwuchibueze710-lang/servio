/**
 * src/util/apiV2.js
 *
 * Client for the new custom backend's /api/v2 endpoints (see MIGRATION_PLAN.md) - separate from
 * src/util/api.js's request()/post() helpers because those default to Sharetribe's
 * 'application/transit+json' serialization for server/api/*.js routes; every /api/v2 route is a
 * plain express.json() endpoint instead (see server/apiRouter.js).
 *
 * Every /api/v2 route except POST /api/v2/auth/bridge itself is gated by requireAuth (a Phase-2
 * JWT tied to an AppUser, not a Sharetribe session). A person browsing Servio right now is
 * authenticated as a SHARETRIBE user (session cookie) - server/api/v2/auth/bridge.js is what
 * turns that into a usable JWT; see its file header for the full rationale. This module owns
 * getting, caching, and refreshing that JWT so callers (RidePageV2.duck.js,
 * DriverRidePageV2.duck.js) never have to think about it - they just call `apiV2(path, options)`.
 */
import { apiBaseUrl } from './api';
import { storableError } from './errors';

const isBrowser = typeof window !== 'undefined';
const TOKEN_STORAGE_KEY = 'servio.appUserToken';

const getStoredToken = () => {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch (e) {
    // Storage can be unavailable (private browsing, disabled cookies/storage) - not fatal, just
    // means we'll bridge again on every call instead of caching. See CategoryHero.js for the same
    // defensive pattern already used elsewhere in this app.
    return null;
  }
};

const storeToken = token => {
  if (!isBrowser) return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (e) {
    // See getStoredToken above.
  }
};

/** Forget the cached AppUser token - e.g. on Sharetribe logout, so a stale token from a
 * previously-bridged account is never reused for whoever logs in next on the same browser. */
export const clearAppUserToken = () => storeToken(null);

/**
 * Store an AppUser JWT directly - used by the real email/password signup and login flows (POST
 * /api/v2/auth/signup, /api/v2/auth/login - see AuthenticationPageV2.js), which never go through
 * the Sharetribe bridge at all. Once this is set, ensureAppUserToken()/apiV2() use it exactly
 * like a bridged token - every existing /api/v2 call works unmodified either way.
 */
export const setAppUserToken = token => storeToken(token);

/**
 * Synchronous check for "is there a usable AppUser session at all right now" - used by v2 pages
 * that no longer sit behind Sharetribe's router-level `auth: true` gate (see
 * routeConfiguration.js) to decide whether to render their real content or a "sign in first"
 * prompt pointing at AuthenticationPageV2, without making a network call just to find out.
 */
export const hasAppUserToken = () => !!getStoredToken();

const jsonRequest = (path, { method = 'GET', body, token } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return window
    .fetch(`${apiBaseUrl()}${path}`, {
      method,
      credentials: 'include', // needed for POST /api/v2/auth/bridge, which reads the Sharetribe session cookie
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    .then(res =>
      res
        .json()
        .catch(() => ({}))
        .then(data => {
          if (!res.ok) {
            const error = new Error(data.message || `Request to ${path} failed with status ${res.status}`);
            error.status = res.status;
            error.data = data;
            throw error;
          }
          return data;
        })
    );
};

/**
 * Ensures we have a usable AppUser JWT, bridging via POST /api/v2/auth/bridge if we don't have
 * one cached yet (or forceRefresh is set - e.g. after the server says our cached one is invalid).
 * Rejects with the same real error shapes bridge.js returns (not_logged_in_to_sharetribe,
 * sharetribe_email_unverified, etc.) - callers should surface these, not swallow them, since each
 * one means something genuinely different for the UI to say.
 */
export const ensureAppUserToken = ({ forceRefresh = false } = {}) => {
  if (!isBrowser) {
    return Promise.reject(new Error('ensureAppUserToken can only run in the browser.'));
  }
  const existing = getStoredToken();
  if (existing && !forceRefresh) {
    return Promise.resolve(existing);
  }
  return jsonRequest('/api/v2/auth/bridge', { method: 'POST' }).then(data => {
    storeToken(data.token);
    return data.token;
  });
};

/**
 * Authenticated /api/v2 call. Bridges for a token first if needed, and retries exactly once with
 * a freshly-bridged token if the server rejects the cached one as unauthorized - covers an
 * expired JWT or a token left over from a JWT_SECRET rotation, without looping forever if the
 * Sharetribe session itself is the real problem (bridge() will fail again identically, and that
 * failure is what actually reaches the caller).
 */
export const apiV2 = (path, options = {}) => {
  return ensureAppUserToken()
    .then(token => jsonRequest(path, { ...options, token }))
    .catch(err => {
      if (err.status === 401) {
        return ensureAppUserToken({ forceRefresh: true }).then(token =>
          jsonRequest(path, { ...options, token })
        );
      }
      throw err;
    });
};

/**
 * Unauthenticated /api/v2 call - for the routes that are genuinely public (GET /api/v2/
 * categories, GET /api/v2/search/providers - see server/apiRouter.js, neither is behind
 * requireAuth). Never bridges for a token: a logged-out visitor browsing provider search
 * results shouldn't be forced through a Sharetribe-login-then-bridge round trip just to see a
 * public list. Using apiV2() (the authenticated helper) against one of these still works, but
 * needlessly requires a Sharetribe session - use this one for anything requireAuth doesn't
 * gate.
 */
export const apiV2Public = (path, options = {}) => jsonRequest(path, options);

/** Same error shape every other duck.js in this app already expects from a caught API error. */
export const storableApiV2Error = err => storableError(err);
