/**
 * server/api/v2/drivers/getMe.js
 *
 * GET /api/v2/drivers/me - the authenticated user's own Driver + Vehicle records, or both null
 * if they haven't onboarded as a driver yet.
 */
const Driver = require('../../../models/Driver');
const Vehicle = require('../../../models/Vehicle');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'driver_database_unavailable',
      message: 'Driver profiles are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const driver = await Driver.findOne({ user: req.appUser._id });
    const vehicle = driver ? await Vehicle.findOne({ driver: driver._id }) : null;
    res.status(200).json({ driver: driver || null, vehicle: vehicle || null });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/drivers/me GET] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
