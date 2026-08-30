/**
 * src/util/mapboxGeocoding.js
 *
 * Standalone Mapbox Geocoding API v6 client - deliberately independent of Sharetribe's
 * GeocoderMapbox (src/components/LocationAutocompleteInput/GeocoderMapbox.js), which is tied to
 * the Sharetribe SDK's LatLng types and the mapboxgl/mapboxSdk globals loaded for map rendering.
 * This one is a plain `fetch` wrapper so the new customer/provider location UI has zero
 * Sharetribe dependency, matching the rest of tonight's work.
 *
 * Requires REACT_APP_MAPBOX_ACCESS_TOKEN (same env var name the rest of the app already uses -
 * see src/config/configMaps.js). Every function resolves to a real result or throws/returns a
 * clear error - never a hardcoded fake location.
 */

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;
const BASE_URL = 'https://api.mapbox.com/search/geocode/v6';

export const isMapboxConfigured = () => typeof MAPBOX_TOKEN === 'string' && MAPBOX_TOKEN.length > 0;

/**
 * Forward geocode a free-text query into real place suggestions.
 * @returns {Promise<Array<{ id, label, lat, lng }>>}
 */
export const mapboxForwardGeocode = async (query, { limit = 5, proximity } = {}) => {
  if (!isMapboxConfigured()) {
    throw new Error('mapbox_not_configured');
  }
  const trimmed = (query || '').trim();
  if (trimmed.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    access_token: MAPBOX_TOKEN,
    limit: String(limit),
    autocomplete: 'true',
  });
  if (proximity && Number.isFinite(proximity.lng) && Number.isFinite(proximity.lat)) {
    params.set('proximity', `${proximity.lng},${proximity.lat}`);
  }

  const response = await fetch(`${BASE_URL}/forward?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`mapbox_geocode_failed_${response.status}`);
  }
  const data = await response.json();
  const features = Array.isArray(data.features) ? data.features : [];

  return features.map(f => ({
    id: f.id,
    label: f.properties?.full_address || f.properties?.name || 'Unknown location',
    lat: f.properties?.coordinates?.latitude ?? f.geometry?.coordinates?.[1],
    lng: f.properties?.coordinates?.longitude ?? f.geometry?.coordinates?.[0],
  })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
};

/**
 * Reverse geocode real coordinates (e.g. from the browser Geolocation API) into a human label.
 * @returns {Promise<{ label, lat, lng }|null>}
 */
export const mapboxReverseGeocode = async (lat, lng) => {
  if (!isMapboxConfigured()) {
    throw new Error('mapbox_not_configured');
  }
  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    access_token: MAPBOX_TOKEN,
    limit: '1',
  });
  const response = await fetch(`${BASE_URL}/reverse?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`mapbox_reverse_geocode_failed_${response.status}`);
  }
  const data = await response.json();
  const feature = Array.isArray(data.features) ? data.features[0] : null;
  if (!feature) return null;
  return {
    label: feature.properties?.full_address || feature.properties?.name || 'Current location',
    lat,
    lng,
  };
};

/**
 * Real browser geolocation -> Mapbox reverse geocode, wrapped as a single promise with clear
 * rejection reasons ('geolocation_unsupported', 'geolocation_denied', or a mapbox_* error).
 */
export const getCurrentLocation = () =>
  new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation_unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        mapboxReverseGeocode(latitude, longitude).then(resolve).catch(reject);
      },
      () => reject(new Error('geolocation_denied')),
      { timeout: 10000 }
    );
  });
