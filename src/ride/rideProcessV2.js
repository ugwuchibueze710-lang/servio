/**
 * src/ride/rideProcessV2.js
 *
 * UI-facing state vocabulary for a ride served by the NEW backend (server/models/RideRequest.js),
 * as opposed to rideProcess.js, which describes the live Sharetribe transaction process. This is
 * deliberately its OWN, smaller module rather than an attempt to force the new backend's simpler
 * model through rideProcess.js's 20-transition Sharetribe graph - the two backends genuinely work
 * differently (see MIGRATION_PLAN.md's "known, disclosed behavior differences" note), and
 * pretending otherwise here would be exactly the kind of fake mapping this project's "no
 * fake/prototype functionality" rule exists to prevent.
 *
 * Concretely, three real differences from rideProcess.js drove this module's shape:
 *  1. Dispatch broadcasts to up to 5 nearby drivers at once and waits for the first to accept
 *     (server/api/v2/rides/create.js), rather than one-at-a-time sequential retry. There is no
 *     "this one candidate declined, try the next" state - just one continuous 'searching' state
 *     that resolves to either a driver or 'no_drivers_found'.
 *  2. Payment happens after trip completion (server/api/v2/payments/createRideIntent.js), not
 *     pre-authorized before a driver is even dispatched - there is no PENDING_PAYMENT-before-
 *     search step.
 *  3. Cancellation is free from any pre-trip state - there is no fee-tiered cancellation yet (see
 *     MIGRATION_PLAN.md); this module has no CANCELLED_WITH_FEE state because nothing charges one.
 */

// Mirrors server/models/RideRequest.js's STATUS_VALUES exactly - this is the actual source of
// truth on the wire; these constants exist so the UI never hand-types the string literals.
export const rideStatuses = {
  REQUESTED: 'requested',
  SEARCHING: 'searching',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_ARRIVING: 'driver_arriving',
  DRIVER_ARRIVED: 'driver_arrived',
  TRIP_STARTED: 'trip_started',
  TRIP_COMPLETED: 'trip_completed',
  CANCELLED: 'cancelled',
  NO_DRIVERS_FOUND: 'no_drivers_found',
};

// Local, client-only UI states layered on top of the ride's real status - 'idle' (no ride
// requested yet) and 'paying' (trip is done, waiting on the Stripe confirm step) don't exist on
// the RideRequest document itself, they're purely about what this page is currently showing.
export const uiStates = {
  IDLE: 'idle',
  ...rideStatuses,
  PAYING: 'paying',
  PAID: 'paid',
};

// Which real ride.status values should render the "Finding your best available driver..." screen.
export const SEARCHING_STATUSES = [rideStatuses.REQUESTED, rideStatuses.SEARCHING];

// Which real ride.status values mean a driver is actively assigned and the trip is either not yet
// started or in progress - drives when to poll driver location and show the live map.
export const ACTIVE_TRIP_STATUSES = [
  rideStatuses.DRIVER_ASSIGNED,
  rideStatuses.DRIVER_ARRIVING,
  rideStatuses.DRIVER_ARRIVED,
  rideStatuses.TRIP_STARTED,
];

// Statuses a customer is still allowed to cancel from (mirrors server/api/v2/rides/cancel.js's
// own CANCELLABLE_STATUSES - kept here too so the UI can hide the Cancel button rather than show
// it and let the server be the only thing that says no).
export const CANCELLABLE_STATUSES = [
  rideStatuses.REQUESTED,
  rideStatuses.SEARCHING,
  rideStatuses.NO_DRIVERS_FOUND,
  rideStatuses.DRIVER_ASSIGNED,
  rideStatuses.DRIVER_ARRIVING,
  rideStatuses.DRIVER_ARRIVED,
];

// The driver-side forward sequence a driver's app steps through one button at a time - mirrors
// server/utils/rideStateMachine.js exactly; DriverRidePageV2.js uses this to know which single
// next status each button press should send, never letting the driver skip a step client-side
// either (the server enforces it regardless, but the UI shouldn't offer a button that can't work).
export const DRIVER_NEXT_STATUS = {
  [rideStatuses.DRIVER_ASSIGNED]: rideStatuses.DRIVER_ARRIVING,
  [rideStatuses.DRIVER_ARRIVING]: rideStatuses.DRIVER_ARRIVED,
  [rideStatuses.DRIVER_ARRIVED]: rideStatuses.TRIP_STARTED,
  [rideStatuses.TRIP_STARTED]: rideStatuses.TRIP_COMPLETED,
};
