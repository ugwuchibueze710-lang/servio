/**
 * src/util/smartSearchNavigation.js
 *
 * Maps a Groq smart-search navigationTarget (server/api/v2/search/smart.js's grounded
 * NAVIGATION_TARGETS allowlist) to a real place in this app - a route to push to, or an action to
 * run in-place (e.g. changing the current page's sort order without a navigation at all). Kept
 * in one place so every page that embeds SmartSearchBox behaves consistently, and so this map
 * grows in lockstep as each destination page actually gets built (tasks #39/#40) rather than the
 * search box silently promising destinations that don't exist yet.
 *
 * @param {string} target - one of smart.js's NAVIGATION_TARGETS
 * @param {{ history: import('history').History, onSortChange?: (sort: string) => void }} ctx
 * @returns {string|null} a human-readable message to show if nothing could be done, else null
 */
const SORT_TARGETS = {
  sort_recommended: 'recommended',
  sort_highest_rated: 'rating',
  sort_closest: 'distance',
  sort_most_reviews: 'reviews',
};

const ROUTE_TARGETS = {
  my_requests: '/my-bookings-v2',
  saved_providers: '/my-bookings-v2?tab=saved',
  messages: '/my-bookings-v2',
  provider_dashboard: '/provider-inbox-v2',
  provider_requests: '/provider-inbox-v2',
  provider_profile_edit: '/provider-profile-v2',
  provider_earnings: '/provider-inbox-v2?tab=earnings',
  settings: '/account-v2/settings',
};

export const applySmartSearchNavigation = (target, { history, onSortChange }) => {
  if (SORT_TARGETS[target]) {
    if (onSortChange) {
      onSortChange(SORT_TARGETS[target]);
      return null;
    }
    // Not on a page that supports sorting right now - fall through to a real search page that
    // does, defaulting to that sort once there.
    history.push('/providers-v2/home-cleaning');
    return null;
  }

  if (target === 'switch_to_provider_mode' || target === 'switch_to_customer_mode') {
    // Real mode switch lives in the account menu (task #50) - not yet reachable as a standalone
    // route, so tell the user where to find it rather than silently doing nothing.
    return 'Use the account menu in the top bar to switch modes.';
  }

  if (ROUTE_TARGETS[target]) {
    history.push(ROUTE_TARGETS[target]);
    return null;
  }

  return "That part of the app isn't available yet.";
};
