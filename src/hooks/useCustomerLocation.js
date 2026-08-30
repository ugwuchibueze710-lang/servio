/**
 * src/hooks/useCustomerLocation.js
 *
 * Real, shared customer location state (spec sections 6-8): a label + coordinates + search
 * radius + locked/unlocked toggle. Backed by localStorage so it works for a signed-out visitor
 * browsing providers, and best-effort synced to PATCH /api/v2/me/location whenever a real
 * AppUser session exists, so a signed-in customer's location survives across devices/reloads
 * (spec's persistence requirement) rather than living only in browser storage.
 *
 * Used by every page that needs "where is this customer looking" - ProviderSearchPageV2,
 * BookingRequestPageV2, the smart search box - so there is exactly one source of truth for it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiV2, apiV2Public, hasAppUserToken } from '../util/apiV2';

const STORAGE_KEY = 'servio.locationPref';
const DEFAULT_RADIUS_MILES = 15;

const readLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const writeLocalStorage = value => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (e) {
    // Storage can be unavailable (private browsing) - the in-memory state still works for this
    // page load, it just won't persist across a reload. Not fatal.
  }
};

const fromServerPref = pref => {
  if (!pref || !Array.isArray(pref.coordinates) || pref.coordinates.length !== 2) return null;
  const [lng, lat] = pref.coordinates;
  return {
    label: pref.label || '',
    lat,
    lng,
    radiusMiles: pref.radiusMiles || DEFAULT_RADIUS_MILES,
    locked: !!pref.locked,
  };
};

/** @returns {[value, setValue, { loading }]} */
const useCustomerLocation = () => {
  const [value, setValue] = useState(() => readLocalStorage() || { radiusMiles: DEFAULT_RADIUS_MILES });
  const [loading, setLoading] = useState(false);
  const loadedFromServer = useRef(false);

  useEffect(() => {
    if (loadedFromServer.current || !hasAppUserToken()) return;
    loadedFromServer.current = true;
    setLoading(true);
    apiV2('/api/v2/auth/me')
      .then(data => {
        const serverPref = fromServerPref(data.user?.locationPref);
        if (serverPref) {
          setValue(serverPref);
          writeLocalStorage(serverPref);
        }
      })
      .catch(() => {
        // Not fatal - local/anonymous state keeps working.
      })
      .finally(() => setLoading(false));
  }, []);

  const setLocation = useCallback(next => {
    setValue(prev => {
      const merged = { ...prev, ...next };
      writeLocalStorage(merged);
      if (hasAppUserToken() && (next.lat !== undefined || next.radiusMiles !== undefined || next.locked !== undefined)) {
        apiV2('/api/v2/me/location', {
          method: 'PATCH',
          body: {
            label: merged.label,
            lat: merged.lat,
            lng: merged.lng,
            radiusMiles: merged.radiusMiles,
            locked: merged.locked,
          },
        }).catch(() => {
          // Best-effort sync - local state (and thus this session's search) already reflects
          // the change regardless of whether the server round trip succeeds.
        });
      }
      return merged;
    });
  }, []);

  return [value, setLocation, { loading }];
};

export default useCustomerLocation;
