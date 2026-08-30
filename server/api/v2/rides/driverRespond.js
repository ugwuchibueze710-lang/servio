/**
 * server/api/v2/rides/driverRespond.js
 *
 * POST /api/v2/rides/:id/driver-respond - a candidate driver accepting or declining a ride
 * that's currently 'searching'. Acceptance is a single atomic findOneAndUpdate keyed on the ride
 * still being 'searching' AND this driver's candidate entry still being 'pending' - two drivers
 * racing to accept the same ride can't both win; whichever update lands first flips the ride to
 * 'driver_assigned' and the second one's conditions no longer match, so it gets a real
 * "someone else already took this" response instead of silently overwriting the assignment.
 * When a decline empties out every remaining candidate, the ride honestly moves to
 * 'no_drivers_found' rather than sitting in 'searching' forever with nobody left to notify.
 */
const RideRequest = require('../../../models/RideRequest');
const Driver = require('../../../models/Driver');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body || {};

  if (action !== 'accept' && action !== 'decline') {
    res.status(400).json({ error: 'invalid_action', message: "action must be 'accept' or 'decline'." });
    return;
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
      res.status(403).json({
        error: 'not_a_driver',
        message: 'Complete driver onboarding before responding to ride requests.',
      });
      return;
    }

    if (action === 'accept') {
      const updated = await RideRequest.findOneAndUpdate(
        {
          _id: id,
          status: 'searching',
          candidateDrivers: { $elemMatch: { driver: myDriver._id, response: 'pending' } },
        },
        {
          $set: {
            status: 'driver_assigned',
            driver: myDriver._id,
            driverAssignedAt: new Date(),
            'candidateDrivers.$[elem].response': 'accepted',
            'candidateDrivers.$[elem].respondedAt': new Date(),
          },
        },
        { new: true, arrayFilters: [{ 'elem.driver': myDriver._id }] }
      );
      if (!updated) {
        res.status(409).json({
          error: 'ride_no_longer_available',
          message: 'This ride was already taken, cancelled, or is no longer awaiting your response.',
        });
        return;
      }
      res.status(200).json({ ride: updated });
      return;
    }

    // decline
    const declined = await RideRequest.findOneAndUpdate(
      { _id: id, candidateDrivers: { $elemMatch: { driver: myDriver._id, response: 'pending' } } },
      {
        $set: {
          'candidateDrivers.$[elem].response': 'declined',
          'candidateDrivers.$[elem].respondedAt': new Date(),
        },
      },
      { new: true, arrayFilters: [{ 'elem.driver': myDriver._id }] }
    );
    if (!declined) {
      res.status(409).json({
        error: 'ride_no_longer_available',
        message: 'This ride is no longer awaiting your response.',
      });
      return;
    }

    const stillPending = declined.candidateDrivers.some(c => c.response === 'pending');
    if (!stillPending && declined.status === 'searching') {
      declined.status = 'no_drivers_found';
      await declined.save();
    }

    res.status(200).json({ ride: declined });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/rides driverRespond] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
