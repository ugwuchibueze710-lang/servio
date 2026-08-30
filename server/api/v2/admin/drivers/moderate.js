/**
 * server/api/v2/admin/drivers/moderate.js
 *
 * PATCH /api/v2/admin/drivers/:id - toggle a driver's active status and/or license verification.
 * Deactivating here also force-takes them offline (isOnline: false) so a suspended driver can't
 * keep receiving ride requests through a session that was already online.
 */
const Driver = require('../../../../models/Driver');
const { isConnected, connect } = require('../../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { active, licenseVerified } = req.body || {};

  if (active === undefined && licenseVerified === undefined) {
    res.status(400).json({ error: 'nothing_to_update', message: 'Provide active and/or licenseVerified.' });
    return;
  }

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
    const driver = await Driver.findById(id);
    if (!driver) {
      res.status(404).json({ error: 'driver_not_found', message: 'This driver could not be found.' });
      return;
    }
    if (typeof active === 'boolean') {
      driver.active = active;
      if (!active) driver.isOnline = false;
    }
    if (typeof licenseVerified === 'boolean') driver.licenseVerified = licenseVerified;
    await driver.save();

    res.status(200).json({ driver });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/drivers moderate] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
