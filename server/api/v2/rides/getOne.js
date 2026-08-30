/**
 * server/api/v2/rides/getOne.js
 *
 * GET /api/v2/rides/:id - poll a single ride's real, current state. Only the requesting customer
 * or a driver who is a candidate/the assigned driver on it may view it - a stranger's ride ID
 * doesn't leak pickup/destination to anyone who guesses it.
 *
 * Once a driver is assigned, also returns their current, real location (from the same
 * updateLocation.js pings that drive rideDispatch.js on the Sharetribe side) so a customer's map
 * has something to plot - the direct equivalent of `rideDriverLocationSelector` reading the
 * driver's Sharetribe listing `geolocation` in RidePage.duck.js today.
 */
const RideRequest = require('../../../models/RideRequest');
const Driver = require('../../../models/Driver');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;

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
    const ride = await RideRequest.findById(id);
    if (!ride) {
      res.status(404).json({ error: 'ride_not_found', message: 'This ride could not be found.' });
      return;
    }

    const isCustomer = String(ride.customer) === String(req.appUser._id);
    const myDriver = await Driver.findOne({ user: req.appUser._id });
    const isCandidateOrAssigned =
      !!myDriver &&
      ((ride.candidateDrivers || []).some(c => String(c.driver) === String(myDriver._id)) ||
        String(ride.driver) === String(myDriver._id));

    if (!isCustomer && !isCandidateOrAssigned) {
      res.status(403).json({ error: 'not_authorized', message: 'You are not a party to this ride.' });
      return;
    }

    let driverLocation = null;
    if (ride.driver) {
      const assignedDriver = await Driver.findById(ride.driver);
      if (assignedDriver && assignedDriver.currentLocation && assignedDriver.currentLocation.coordinates) {
        const [lng, lat] = assignedDriver.currentLocation.coordinates;
        driverLocation = { lat, lng, updatedAt: assignedDriver.locationUpdatedAt || null };
      }
    }

    res.status(200).json({ ride, driverLocation });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/rides getOne] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
