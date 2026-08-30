/**
 * server/api/v2/rides/cancel.js
 *
 * POST /api/v2/rides/:id/cancel - the customer cancelling their own ride, only while it's still
 * in a cancellable state (not already completed/cancelled). Once a trip has started, cancelling
 * mid-trip is out of scope for this pass (see MIGRATION_PLAN.md Phase 5 note) - this covers the
 * requested/searching/driver_assigned/driver_arriving/driver_arrived window.
 */
const RideRequest = require('../../../models/RideRequest');
const { isConnected, connect } = require('../../../db/mongoose');

const CANCELLABLE_STATUSES = [
  'requested',
  'searching',
  'no_drivers_found',
  'driver_assigned',
  'driver_arriving',
  'driver_arrived',
];

module.exports = async (req, res) => {
  const { id } = req.params;
  const { cancelReason } = req.body || {};

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
    if (String(ride.customer) !== String(req.appUser._id)) {
      res.status(403).json({ error: 'not_authorized', message: 'This is not your ride.' });
      return;
    }
    if (!CANCELLABLE_STATUSES.includes(ride.status)) {
      res.status(409).json({
        error: 'invalid_transition',
        message: `A ride that is '${ride.status}' can no longer be cancelled.`,
      });
      return;
    }

    ride.status = 'cancelled';
    ride.cancelledAt = new Date();
    if (typeof cancelReason === 'string' && cancelReason.trim()) {
      ride.cancelReason = cancelReason.trim();
    }
    await ride.save();

    res.status(200).json({ ride });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/rides cancel] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
