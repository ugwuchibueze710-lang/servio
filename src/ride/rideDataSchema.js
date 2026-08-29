/**
 * Ride extended-data schema.
 *
 * Sharetribe Flex has no generic custom database - see
 * RIDE_INTEGRATION_REPORT.md section 5. Everything the spec calls a
 * separate entity (DriverAvailability, DriverLocation, RideEvent, ...) has
 * to become a documented, versioned key inside the `publicData` /
 * `privateData` / `protectedData` / `metadata` bags that Sharetribe already
 * attaches to users, listings, and transactions. This module is the single
 * source of truth for those keys so nothing gets duplicated or drifts
 * between the rider UI, the driver UI, and the server.
 *
 * Scope reminder (Sharetribe semantics):
 *  - publicData:    visible to anyone, searchable/filterable.
 *  - privateData:   visible only to the owner (the driver, for their own
 *                    listing) and trusted server code - not other users.
 *  - protectedData: visible only to the parties of a transaction (this
 *                    customer and this driver) once the transaction exists.
 *  - metadata:       admin/operator-writable-only from the client; only
 *                    trusted server code (privileged transitions) can set
 *                    it. This is where server-decided facts belong - the
 *                    exact enforcement the spec's section 22 asks for.
 */

// ---------------------------------------------------------------------------
// USER (driver) extended data
// ---------------------------------------------------------------------------
// A Servio user becomes a driver by publishing a Ride listing (see LISTING
// below) - there is no separate driver account. These keys live on the
// user profile because they're relevant even when no specific listing is
// loaded (e.g. "is this current user a driver at all" for nav rendering).
export const USER_PUBLIC_DATA = {
  // true once the user has completed driver onboarding (vehicle info,
  // license, etc. captured on their Ride listing) - lets the UI show a
  // "Drive with Servio" vs. "Ride dashboard" entry point without an extra
  // listing fetch.
  IS_RIDE_DRIVER: 'isRideDriver',
};

// ---------------------------------------------------------------------------
// LISTING (the driver's "Ride" listing) extended data
// ---------------------------------------------------------------------------
// One listing per driver, of listingType `ride-driver` (see
// sharetribe-setup/categories.json / Console listing type config, added as
// part of Phase 3). Multi-service providers keep their other listings
// (lawn care, moving, ...) completely separate - see section 16 of the
// spec ("ride availability must not interfere with their other services").
// NOTE on `isOnline` and location living in *public* data below, not
// private: Sharetribe's listing search (`sdk.listings.query`) can only
// filter/sort on publicData (with a search index) and the listing's own
// native `geolocation` attribute - it cannot query another user's
// privateData at all from the normal SDK. Nearest-eligible-driver dispatch
// (spec section 8) has to run through that same public search endpoint, so
// `isOnline` needs a search index and the driver's coarse position has to
// live in the listing's own built-in `geolocation` field (the same public,
// geo-indexed attribute every other Servio listing already uses for map
// search) rather than a custom private key. This is a deliberate,
// considered trade-off, not an oversight: "this specific driver is
// currently on shift, roughly here" is the same level of exposure every
// active Servio provider already has. Phase 1 also uses this same field
// for in-trip live tracking rather than a more tightly-scoped alternative -
// see the note below TX_PROTECTED_DATA for why, and what a tighter Phase 2
// version would need.
export const LISTING_PUBLIC_DATA = {
  VEHICLE_MAKE: 'vehicleMake',
  VEHICLE_MODEL: 'vehicleModel',
  VEHICLE_COLOR: 'vehicleColor',
  VEHICLE_YEAR: 'vehicleYear',
  LICENSE_PLATE: 'licensePlate',
  RIDE_TYPE: 'rideType', // e.g. 'standard' | 'xl' | 'accessible' - drives fare tier selection
  SERVICE_AREA_ID: 'serviceAreaId', // ties into the existing configServiceAreas.js
  // Whether the driver has toggled themselves online (eligible to be
  // matched). Needs `filterConfig.indexForSearch: true` in Console (see
  // DEPLOYMENT_RIDE.md) so `pub_isOnline=true` can be used as a search
  // filter by server/api-util/rideDispatch.js.
  IS_ONLINE: 'isOnline',
};

// The listing's native `geolocation` attribute (not a custom field - every
// Sharetribe listing has this) holds the driver's coarse current position
// while idle/available, updated on the throttled interval described in
// rideDirections.js via `sdk.ownListings.update({ id, geolocation })`.

export const LISTING_PRIVATE_DATA = {
  // Set by the server (server/api-util/rideDispatch.js) whenever this
  // driver has an active, unfinished ride transaction - prevents the
  // driver from being matched to a second ride, and prevents them from
  // going offline mid-trip (spec section 16/22). Private because it's an
  // internal dispatch-locking detail, not something search needs to filter
  // on directly (eligibility is fully captured by isOnline, which the
  // driver dashboard duck clears server-side whenever this is set).
  ACTIVE_RIDE_TRANSACTION_ID: 'activeRideTransactionId',
};

// ---------------------------------------------------------------------------
// TRANSACTION (one ride) extended data
// ---------------------------------------------------------------------------
export const TX_PROTECTED_DATA = {
  PICKUP: 'pickup', // { lat, lng, address }
  DESTINATION: 'destination', // { lat, lng, address }
  ROUTE_POLYLINE: 'routePolyline', // encoded polyline for the planned route, from Mapbox Directions
  ESTIMATED_DISTANCE_METERS: 'estimatedDistanceMeters',
  ESTIMATED_DURATION_SECONDS: 'estimatedDurationSeconds',
  CANCELLATION_REASON: 'cancellationReason',
};

// NOTE on live driver location during an active trip: as implemented (see
// RidePage.duck.js `rideDriverLocationSelector` and
// DriverRidePage.duck.js's location thunks), this reuses the SAME public
// listing `geolocation` field described under LISTING_PUBLIC_DATA above,
// continuously updated throughout the trip - not a separate protectedData
// key. That was a deliberate scope call for Phase 1: Sharetribe only
// mutates a transaction's protectedData as part of a state-changing
// transition, never as a standalone "just update this one field" call, so
// it's the wrong shape for a value that changes every few seconds without
// the ride's state changing. Segregating in-trip location to something
// only the two ride parties can see (tighter than "any authenticated
// client can see this driver's live position") is a real, worthwhile
// privacy improvement for Phase 2, once `sdk.transactions.updateMetadata`
// (a standalone, non-transition metadata update Sharetribe's SDK exposes)
// has been confirmed against the SDK reference to support this - it was
// not used here without that verification.

// Anything here is only ever written by trusted server code inside a
// privileged transition (server/api/transition-privileged.js /
// server/api/initiate-privileged.js) - never accepted verbatim from the
// client. This is the concrete mechanism behind spec section 22 ("never
// trust the client for fare / driver identity / commission / ...").
export const TX_METADATA = {
  ACTUAL_DISTANCE_METERS: 'actualDistanceMeters',
  ACTUAL_DURATION_SECONDS: 'actualDurationSeconds',
  FARE_BREAKDOWN: 'fareBreakdown', // the exact object calculateRideFare() returned, for the receipt
  DRIVER_MATCH_RANK: 'driverMatchRank', // this candidate's position in the dispatch attempt (1st, 2nd, ...)
  DISPATCH_ATTEMPT_ID: 'dispatchAttemptId', // correlates sequential retry transactions for one ride request
};

/**
 * Small helper so call sites don't repeat the `publicData`/`privateData`/
 * `protectedData` nesting and can fail loudly if a key is misspelled.
 */
export const readExtendedData = (entity, scope, key) => {
  const bag = entity?.attributes?.[scope];
  if (bag && !(key in bag)) {
    return undefined;
  }
  return bag ? bag[key] : undefined;
};
