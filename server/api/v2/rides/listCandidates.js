/**
 * server/api/v2/rides/listCandidates.js
 *
 * GET /api/v2/rides/candidates/mine - the ride requests currently waiting on THIS driver to
 * respond (status 'searching', this driver in candidateDrivers with response 'pending'). This is
 * how a driver's app finds "an incoming ride request" without needing the real-time Socket.IO
 * layer yet (see MIGRATION_PLAN.md Phase 5 note on why that's still a poll for now).
 */
const RideRequest = require('../../../models/RideRequest');
const Driver = require('../../../models/Driver');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'ride_database_unavailable',
      message: 'Rides are not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  try {
    const myDriver = await Driver.findOne({ user: req.appUser._id });
    if (!myDriver) {
      res.status(200).json({
        data: [],
        message: 'Complete driver onboarding (POST /api/v2/drivers/me) to receive ride requests.',
      });
      return;
    }

    const rides = await RideRequest.find({
      status: 'searching',
      candidateDrivers: { $elemMatch: { driver: myDriver._id, response: 'pending' } },
    })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ data: rides });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/rides listCandidates] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
