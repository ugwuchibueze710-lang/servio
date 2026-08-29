/**
 * Real driving route/distance/duration for Ride, built entirely on
 * Servio's existing Mapbox setup - no new library, no new token.
 *
 * `window.mapboxSdk` is the same bundled `@mapbox/mapbox-sdk` client that
 * `GeocoderMapbox.js` already uses for `client.geocoding.forwardGeocode`
 * (see `src/util/includeScripts.js`, which loads
 * `/static/scripts/mapbox/mapbox-sdk@0.16.2/mapbox-sdk.min.js` and sets
 * `window.mapboxgl.accessToken`). This module just calls the sibling
 * `client.directions` service on that same client.
 */

import polyline from '@mapbox/polyline';

const getClient = () => {
  const libLoaded = typeof window !== 'undefined' && window.mapboxgl && window.mapboxSdk;
  if (!libLoaded) {
    throw new Error('Mapbox libraries are not loaded yet - rideDirections requires window.mapboxSdk.');
  }
  if (!window.mapboxgl.accessToken) {
    throw new Error('Mapbox access token is not yet available.');
  }
  return window.mapboxSdk({ accessToken: window.mapboxgl.accessToken });
};

/**
 * @param {{lat:number,lng:number}} origin
 * @param {{lat:number,lng:number}} destination
 * @returns {Promise<{
 *   distanceInMeters: number,
 *   durationInSeconds: number,
 *   routeGeoJSON: Object,
 *   routePolyline: string,
 * }>}
 */
export const getDrivingRoute = (origin, destination) => {
  if (!origin || !destination) {
    return Promise.reject(new Error('getDrivingRoute requires both an origin and a destination.'));
  }

  return getClient()
    .directions.getDirections({
      profile: 'driving',
      waypoints: [
        { coordinates: [origin.lng, origin.lat] },
        { coordinates: [destination.lng, destination.lat] },
      ],
      geometries: 'geojson',
      overview: 'full',
    })
    .send()
    .then(response => {
      const route = response?.body?.routes?.[0];
      if (!route) {
        const error = new Error('No driving route found between the given pickup and destination.');
        error.code = 'ROUTE_NOT_FOUND';
        throw error;
      }

      const routeGeoJSON = {
        type: 'Feature',
        properties: {},
        geometry: route.geometry, // already GeoJSON LineString because geometries: 'geojson'
      };

      // Also keep an encoded polyline around, since it's a much smaller
      // payload to store on the transaction's protectedData
      // (TX_PROTECTED_DATA.ROUTE_POLYLINE) than the raw GeoJSON coordinates.
      const latLngPairs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

      return {
        distanceInMeters: route.distance,
        durationInSeconds: route.duration,
        routeGeoJSON,
        routePolyline: polyline.encode(latLngPairs),
      };
    });
};

/** Decode a polyline (e.g. from TX_PROTECTED_DATA.ROUTE_POLYLINE) back into a GeoJSON Feature for RideMap. */
export const decodeRouteToGeoJSON = encodedPolyline => {
  if (!encodedPolyline) {
    return null;
  }
  const latLngPairs = polyline.decode(encodedPolyline);
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: latLngPairs.map(([lat, lng]) => [lng, lat]),
    },
  };
};

/**
 * Bearing in degrees (0-360, 0 = north) from point A to point B - used to
 * rotate the vehicle marker in RideMap so it visually faces the direction
 * of travel (spec section 11). Computed locally; no API call needed.
 */
export const bearingBetween = (from, to) => {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;

  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const deltaLng = toRad(to.lng - from.lng);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  const bearingRad = Math.atan2(y, x);

  return (toDeg(bearingRad) + 360) % 360;
};
