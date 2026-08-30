/**
 * src/util/marketplaceMode.js
 *
 * Servio works in exactly two modes: Customer Mode (browsing and booking services) and Provider
 * Mode (managing your own listings and orders). A person is only ever in one mode at a time, and
 * the account menu is where they switch between them (see TopbarMobileMenu.js / TopbarDesktop.js).
 *
 * This is a lightweight, client-only "which mode is currently being shown" preference - it does
 * NOT introduce a new account concept, backend field, or role. Whether someone is actually
 * allowed to act as a provider, or already has listings, is still answered entirely by existing
 * data (currentUserHasListings from ducks/user.duck.js, and the role config read via
 * util/userHelpers.js#getCurrentUserTypeRoles). This file only remembers, per browser, which of
 * those two already-existing experiences the navigation should currently present, so switching
 * modes doesn't reset itself every time the account menu closes.
 */

const STORAGE_KEY = 'servio.viewMode';

export const MODE_CUSTOMER = 'customer';
export const MODE_PROVIDER = 'provider';

const isBrowser = typeof window !== 'undefined';

const readStoredMode = () => {
  if (!isBrowser) {
    return null;
  }
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === MODE_CUSTOMER || value === MODE_PROVIDER ? value : null;
  } catch (e) {
    // Storage can be unavailable (private browsing, disabled storage) - just fall back to the
    // computed default below every time; nothing else depends on this succeeding.
    return null;
  }
};

/**
 * Resolve which mode should currently be considered active for the account menu.
 * - If this person has explicitly switched modes before (in this browser), honor that choice.
 * - Otherwise default to Provider Mode for people who already have listings (so a returning
 *   provider lands back in their own dashboard view), and Customer Mode for everyone else.
 *
 * @param {boolean} currentUserHasListings
 * @returns {'customer' | 'provider'}
 */
export const getViewMode = currentUserHasListings => {
  const stored = readStoredMode();
  if (stored) {
    return stored;
  }
  return currentUserHasListings ? MODE_PROVIDER : MODE_CUSTOMER;
};

/**
 * Remember an explicit mode switch for this browser.
 * @param {'customer' | 'provider'} mode
 */
export const setViewMode = mode => {
  if (!isBrowser) {
    return;
  }
  try {
    if (mode === MODE_CUSTOMER || mode === MODE_PROVIDER) {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  } catch (e) {
    // Not fatal - the chosen mode just won't survive a page reload.
  }
};
