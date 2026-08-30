/**
 * server/utils/rideStateMachine.js
 *
 * The driver-side forward lifecycle for an assigned ride (spec section 13/14), once
 * driverRespond.js has already moved a RideRequest into 'driver_assigned':
 * driver_assigned -> driver_arriving -> driver_arrived -> trip_started -> trip_completed.
 * Every step is sequential and driver-only (the assigned driver, specifically - not just any
 * driver) - there is no "jump straight to trip_completed" path, mirroring
 * server/utils/bookingStateMachine.js's existing pattern for the same reason: the frontend must
 * never just flip a status field, it has to come from a real transition this table allows.
 * Cancellation is handled separately by server/api/v2/rides/cancel.js's own status list (customer-
 * initiated, from any pre-trip state), not folded into this table.
 */
const ALLOWED_TRANSITIONS = {
  driver_assigned: ['driver_arriving'],
  driver_arriving: ['driver_arrived'],
  driver_arrived: ['trip_started'],
  trip_started: ['trip_completed'],
  trip_completed: [],
};

const canTransition = (fromStatus, toStatus) => (ALLOWED_TRANSITIONS[fromStatus] || []).includes(toStatus);

// A driver is "busy" (excluded from new candidate pools, and this is what a driver's own
// active-ride lookup searches for) in exactly these statuses - shared between
// server/api/v2/rides/create.js and server/api/v2/rides/getActiveMine.js so the two can never
// silently drift apart.
const ACTIVE_RIDE_STATUSES = ['driver_assigned', 'driver_arriving', 'driver_arrived', 'trip_started'];

module.exports = { ALLOWED_TRANSITIONS, canTransition, ACTIVE_RIDE_STATUSES };
