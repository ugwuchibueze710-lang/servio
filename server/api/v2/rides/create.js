/**
 * server/api/v2/rides/create.js
 *
 * POST /api/v2/rides - a customer requests a ride. Immediately runs real driver matching (a
 * genuine 2dsphere $near query against currently-online, currently-UNBUSY Drivers within
 * MATCH_RADIUS_MILES of pickup) rather than leaving the ride sitting in a vague "requested" limbo
 * - the result is either real candidate drivers (status 'searching', exactly who and how many
 * recorded on the document) or a real, honest 'no_drivers_found' status (spec's "No drivers found
 * nearby yet" requirement), never a fake assigned driver.
 *
 * "Currently unbusy" (excluding drivers already on an active ride) was added in the lifecycle-
 * parity pass alongside updateStatus.js - without it, a driver mid-trip on one ride could be
 * handed a second ride's candidate slot, since isOnline alone doesn't say "free right now." A
 * driver stays a legitimate 'searching'-phase candidate on more than one ride at once (that's the
 * existing, tested broadcast-to-several-nearby-drivers design - see driverRespond.js) - it's only
 * once they've actually accepted one that they're excluded from new candidate pools.
 *
 * Requires the same real, Mapbox-derived pickup/destination/distance/duration the live Sharetribe
 * ride flow already requires (spec section 22: never fabricate a fare from missing route data) -
 * the fare is computed HERE, server-side, from that real distance/duration, never trusted from the
 * client, exactly like server/api/ride-initiate-privileged.js already does for the Sharetribe
 * version.
 */
const RideRequest = require('../../../models/RideRequest');
const Driver = require('../../../models/Driver');
const { isConnected, connect } = require('../../../db/mongoose');
const { calculateRideFare, MILES_PER_METER, MINUTES_PER_SECOND } = require('../../../utils/rideFare');

const MILES_TO_METERS = 1609.34;
const MATCH_RADIUS_MILES = 10;
const MAX_CANDIDATES = 5;
const ACTIVE_RIDE_STATUSES = ['driver_assigned', 'driver_arriving', 'driver_arrived', 'trip_started'];

const parsePoint = (point, label) => {
  if (!point || typeof point !== 'object') return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  return {
    type: 'Point',
    coordinates: [lng, lat],
    label: typeof point.label === 'string' ? point.label.trim() : label,
  };
};

module.exports = async (req, res) => {
  const { pickup, destination, distanceInMeters, durationInSeconds } = req.body || {};

  const pickupPoint = parsePoint(pickup, 'Pickup');
  if (!pickupPoint) {
    res.status(400).json({ error: 'invalid_pickup', message: 'A valid pickup location (lat/lng) is required.' });
    return;
  }
  const destinationPoint = parsePoint(destination, 'Destination');
  if (!destinationPoint) {
    res.status(400).json({
      error: 'invalid_destination',
      message: 'A valid destination location (lat/lng) is required.',
    });
    return;
  }
  if (!(distanceInMeters >= 0) || !(durationInSeconds >= 0)) {
    res.status(400).json({
      error: 'invalid_route',
      message: 'A real distanceInMeters and durationInSeconds (from Mapbox Directions) is required.',
    });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'ride_database_unavailable',
      message: 'Ride requests are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const busyDriverIds = await RideRequest.find({ status: { $in: ACTIVE_RIDE_STATUSES } }).distinct('driver');

    const nearbyDrivers = await Driver.find({
      isOnline: true,
      active: true,
      _id: { $nin: busyDriverIds },
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: pickupPoint.coordinates },
          $maxDistance: MATCH_RADIUS_MILES * MILES_TO_METERS,
        },
      },
    }).limit(MAX_CANDIDATES);

    const fare = calculateRideFare({ distanceInMeters, durationInSeconds });

    const ride = await RideRequest.create({
      customer: req.appUser._id,
      pickup: pickupPoint,
      destination: destinationPoint,
      estimatedDistanceMiles: Math.round(distanceInMeters * MILES_PER_METER * 100) / 100,
      estimatedDurationMinutes: Math.round(durationInSeconds * MINUTES_PER_SECOND * 100) / 100,
      estimatedFare: fare.totalInSubunits,
      status: nearbyDrivers.length > 0 ? 'searching' : 'no_drivers_found',
      candidateDrivers: nearbyDrivers.map(d => ({ driver: d._id, response: 'pending' })),
    });

    res.status(201).json({ ride, candidateCount: nearbyDrivers.length });
  } catch (err) {
    if (err.status === 400) {
      res.status(400).json({ error: 'invalid_route', message: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[api/v2/rides create] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
