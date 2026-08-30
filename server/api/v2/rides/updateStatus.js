/**
 * server/api/v2/rides/updateStatus.js
 *
 * POST /api/v2/rides/:id/status - the assigned driver moving a ride forward through
 * driver_assigned -> driver_arriving -> driver_arrived -> trip_started -> trip_completed (spec
 * section 13/14), checked against server/utils/rideStateMachine.js so there is no "just set the
 * status field" path - only the actual assigned driver, moving one real step at a time.
 *
 * Completing a trip requires the REAL, ACTUALLY-DRIVEN distance/duration (accumulated client-side
 * from GPS samples over the course of the trip, the same "never trust the estimate for the final
 * charge" rule the live Sharetribe implementation already follows for COMPLETE_TRIP - see
 * DriverRidePage.js's odometer hook) and recomputes the final fare from scratch server-side via
 * rideFare.js, exactly like the estimate at request time is never trusted for the final charge.
 */
const RideRequest = require('../../../models/RideRequest');
const Driver = require('../../../models/Driver');
const { isConnected, connect } = require('../../../db/mongoose');
const { canTransition } = require('../../../utils/rideStateMachine');
const { calculateRideFare, MILES_PER_METER, MINUTES_PER_SECOND } = require('../../../utils/rideFare');

const DRIVER_STATUSES = ['driver_arriving', 'driver_arrived', 'trip_started', 'trip_completed'];

module.exports = async (req, res) => {
  const { id } = req.params;
  const { status, actualDistanceInMeters, actualDurationInSeconds } = req.body || {};

  if (!DRIVER_STATUSES.includes(status)) {
    res.status(400).json({
      error: 'invalid_status',
      message: `status must be one of: ${DRIVER_STATUSES.join(', ')}.`,
    });
    return;
  }

  if (status === 'trip_completed') {
    if (!(actualDistanceInMeters >= 0) || !(actualDurationInSeconds >= 0)) {
      res.status(400).json({
        error: 'invalid_trip_data',
        message: 'Completing a trip requires the real actualDistanceInMeters and actualDurationInSeconds driven.',
      });
      return;
    }
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'ride_database_unavailable',
      message: 'Rides are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const myDriver = await Driver.findOne({ user: req.appUser._id });
    if (!myDriver) {
      res.status(403).json({ error: 'not_a_driver', message: 'Complete driver onboarding first.' });
      return;
    }

    const ride = await RideRequest.findById(id);
    if (!ride) {
      res.status(404).json({ error: 'ride_not_found', message: 'This ride could not be found.' });
      return;
    }
    if (!ride.driver || String(ride.driver) !== String(myDriver._id)) {
      res.status(403).json({ error: 'not_authorized', message: 'You are not the assigned driver for this ride.' });
      return;
    }
    if (!canTransition(ride.status, status)) {
      res.status(409).json({
        error: 'invalid_transition',
        message: `A ride that is '${ride.status}' cannot move to '${status}'.`,
      });
      return;
    }

    const now = new Date();
    if (status === 'trip_started') {
      ride.tripStartedAt = now;
    } else if (status === 'trip_completed') {
      const fare = calculateRideFare({
        distanceInMeters: actualDistanceInMeters,
        durationInSeconds: actualDurationInSeconds,
      });
      ride.finalFare = fare.totalInSubunits;
      ride.actualDistanceMiles = Math.round(actualDistanceInMeters * MILES_PER_METER * 100) / 100;
      ride.actualDurationMinutes = Math.round(actualDurationInSeconds * MINUTES_PER_SECOND * 100) / 100;
      ride.tripCompletedAt = now;
    }
    ride.status = status;
    await ride.save();

    res.status(200).json({ ride });
  } catch (err) {
    if (err.status === 400) {
      res.status(400).json({ error: 'invalid_trip_data', message: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[api/v2/rides updateStatus] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
