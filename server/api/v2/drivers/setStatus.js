/**
 * server/api/v2/drivers/setStatus.js
 *
 * POST /api/v2/drivers/me/status - the online/offline toggle ride matching depends on (spec
 * section 12/13: only isOnline drivers with a currentLocation are ever matched). Going online
 * without a real vehicle on file, or without a current location, is rejected outright - there is
 * no "online with no location" state that would silently never match anyone.
 */
const Driver = require('../../../models/Driver');
const Vehicle = require('../../../models/Vehicle');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { isOnline, lat, lng } = req.body || {};

  if (typeof isOnline !== 'boolean') {
    res.status(400).json({ error: 'invalid_status', message: 'isOnline must be true or false.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'driver_database_unavailable',
      message: 'Driver status is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const driver = await Driver.findOne({ user: req.appUser._id });
    if (!driver) {
      res.status(404).json({
        error: 'driver_profile_missing',
        message: 'Complete driver onboarding (POST /api/v2/drivers/me) before going online.',
      });
      return;
    }

    if (isOnline) {
      const vehicle = await Vehicle.findOne({ driver: driver._id });
      if (!vehicle) {
        res.status(400).json({
          error: 'vehicle_missing',
          message: 'Register a vehicle before going online.',
        });
        return;
      }
      const latNum = Number(lat);
      const lngNum = Number(lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        res.status(400).json({
          error: 'invalid_location',
          message: 'A current location (lat/lng) is required to go online.',
        });
        return;
      }
      driver.currentLocation = { type: 'Point', coordinates: [lngNum, latNum] };
      driver.locationUpdatedAt = new Date();
    }
    driver.isOnline = isOnline;
    await driver.save();

    res.status(200).json({ driver });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/drivers/me/status] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
