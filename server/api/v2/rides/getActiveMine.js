/**
 * server/api/v2/rides/getActiveMine.js
 *
 * GET /api/v2/rides/active/mine - the driver's own currently-assigned, not-yet-finished ride, if
 * any. Without this, a driver whose app reloads (or that just re-opens the tab) mid-trip would
 * have no way to find their way back to that ride - GET /api/v2/rides/:id needs an id the client
 * already has to know about, and listCandidates.js only returns rides still awaiting a response,
 * not ones already accepted. Real gap, closed here rather than left for later, since
 * DriverRidePageV2.js depends on it to recover state after a refresh.
 */
const RideRequest = require('../../../models/RideRequest');
const Driver = require('../../../models/Driver');
const { isConnected, connect } = require('../../../db/mongoose');
const { ACTIVE_RIDE_STATUSES } = require('../../../utils/rideStateMachine');

module.exports = async (req, res) => {
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
      res.status(200).json({ ride: null });
      return;
    }

    const ride = await RideRequest.findOne({
      driver: myDriver._id,
      status: { $in: ACTIVE_RIDE_STATUSES },
    });

    res.status(200).json({ ride: ride || null });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/rides getActiveMine] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
