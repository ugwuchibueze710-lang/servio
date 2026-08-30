/**
 * server/api/v2/me/updateLocation.js
 *
 * PATCH /api/v2/me/location - persists the customer's location control state (spec sections 6-8):
 * a real Mapbox-resolved label + coordinates, a search radius, and the locked/unlocked toggle.
 * Never stores raw user-entered text as the only location info - lat/lng are required together
 * whenever a label is being set (i.e. this is only ever written from an actual Mapbox geocoding
 * result, not free typing).
 */
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { label, lat, lng, radiusMiles, locked } = req.body || {};

  const hasCoords = lat !== undefined && lng !== undefined;
  let latNum;
  let lngNum;
  if (hasCoords) {
    latNum = Number(lat);
    lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      res.status(400).json({ error: 'invalid_location', message: 'Location coordinates are invalid.' });
      return;
    }
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'database_unavailable',
      message: 'The account database is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  const appUser = req.appUser;
  const pref = appUser.locationPref || {};

  if (hasCoords) {
    pref.coordinates = [lngNum, latNum];
    pref.label = typeof label === 'string' ? label.trim().slice(0, 200) : pref.label;
  }
  if (radiusMiles !== undefined) {
    const radius = Number(radiusMiles);
    if (Number.isFinite(radius)) {
      pref.radiusMiles = Math.min(Math.max(radius, 1), 200);
    }
  }
  if (typeof locked === 'boolean') {
    if (locked && !pref.coordinates) {
      res.status(400).json({
        error: 'no_location_selected',
        message: 'Select a location before locking it.',
      });
      return;
    }
    pref.locked = locked;
  }

  appUser.locationPref = pref;
  await appUser.save();

  res.status(200).json({ locationPref: appUser.locationPref });
};
