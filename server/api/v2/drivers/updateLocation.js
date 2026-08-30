/**
 * server/api/v2/drivers/updateLocation.js
 *
 * PATCH /api/v2/drivers/me/location - the throttled (~5-15s, per RIDE_INTEGRATION_REPORT.md
 * section 5) location ping a driver's app sends while online, whether idle (waiting for a match)
 * or mid-trip (so the rider's map has something real to show - see
 * server/api/v2/rides/getOne.js). Deliberately separate from setStatus.js's location write: that
 * one is "here's where I am as I go online," this one is the repeated tick after that.
 *
 * Refuses to accept a location update from a driver who isn't online - there's no legitimate
 * reason for the app to be sending location pings otherwise, and accepting them anyway would let
 * a stale location sit on a Driver document indefinitely without the isOnline flag actually
 * reflecting it.
 */
const Driver = require('../../../models/Driver');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { lat, lng } = req.body || {};
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
    res.status(400).json({ error: 'invalid_location', message: 'A real lat/lng is required.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'driver_database_unavailable',
      message: 'Driver location is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const driver = await Driver.findOne({ user: req.appUser._id });
    if (!driver) {
      res.status(404).json({ error: 'driver_profile_missing', message: 'Complete driver onboarding first.' });
      return;
    }
    if (!driver.isOnline) {
      res.status(409).json({
        error: 'driver_not_online',
        message: 'Go online (POST /api/v2/drivers/me/status) before sending location updates.',
      });
      return;
    }

    driver.currentLocation = { type: 'Point', coordinates: [lngNum, latNum] };
    driver.locationUpdatedAt = new Date();
    await driver.save();

    res.status(200).json({ driver });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/drivers/me/location] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
