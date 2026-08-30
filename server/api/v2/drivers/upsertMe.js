/**
 * server/api/v2/drivers/upsertMe.js
 *
 * POST /api/v2/drivers/me - creates or updates the authenticated AppUser's Driver record and
 * their Vehicle. Both are required together (spec section 12: a driver needs a registered
 * vehicle before they can go online) - this endpoint writes both real documents in one real
 * request, not a driver record with vehicle info deferred to "later".
 */
const Driver = require('../../../models/Driver');
const Vehicle = require('../../../models/Vehicle');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { phone, operatingAreaLabel, vehicle } = req.body || {};

  const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
  if (!trimmedPhone || trimmedPhone.length < 7) {
    res.status(400).json({ error: 'invalid_phone', message: 'A valid phone number is required.' });
    return;
  }
  if (!vehicle || typeof vehicle !== 'object') {
    res.status(400).json({ error: 'missing_vehicle', message: 'Vehicle details are required.' });
    return;
  }
  const make = typeof vehicle.make === 'string' ? vehicle.make.trim() : '';
  const model = typeof vehicle.model === 'string' ? vehicle.model.trim() : '';
  const licensePlate = typeof vehicle.licensePlate === 'string' ? vehicle.licensePlate.trim() : '';
  if (!make || !model || !licensePlate) {
    res.status(400).json({
      error: 'invalid_vehicle',
      message: 'Vehicle make, model, and license plate are all required.',
    });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'driver_database_unavailable',
      message: 'Driver onboarding is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    let driver = await Driver.findOne({ user: req.appUser._id });
    let created = false;
    if (driver) {
      driver.phone = trimmedPhone;
      if (operatingAreaLabel !== undefined) driver.operatingAreaLabel = String(operatingAreaLabel).trim();
      await driver.save();
    } else {
      driver = await Driver.create({
        user: req.appUser._id,
        phone: trimmedPhone,
        operatingAreaLabel: typeof operatingAreaLabel === 'string' ? operatingAreaLabel.trim() : undefined,
      });
      created = true;
    }

    let vehicleDoc = await Vehicle.findOne({ driver: driver._id });
    const vehicleUpdate = {
      type: typeof vehicle.type === 'string' ? vehicle.type.trim() : undefined,
      make,
      model,
      year: Number.isFinite(Number(vehicle.year)) ? Number(vehicle.year) : undefined,
      color: typeof vehicle.color === 'string' ? vehicle.color.trim() : undefined,
      licensePlate,
      photoUrl: typeof vehicle.photoUrl === 'string' ? vehicle.photoUrl.trim() : undefined,
    };
    if (vehicleDoc) {
      Object.assign(vehicleDoc, vehicleUpdate);
      await vehicleDoc.save();
    } else {
      vehicleDoc = await Vehicle.create({ ...vehicleUpdate, driver: driver._id });
    }

    if (!req.appUser.roles.includes('driver')) {
      req.appUser.roles.push('driver');
      await req.appUser.save();
    }

    res.status(created ? 201 : 200).json({ driver, vehicle: vehicleDoc });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/drivers/me POST] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
