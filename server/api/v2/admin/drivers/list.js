/**
 * server/api/v2/admin/drivers/list.js
 *
 * GET /api/v2/admin/drivers - every driver, including inactive/unverified ones, for admin
 * moderation (e.g. license verification per spec section 12).
 */
const Driver = require('../../../../models/Driver');
const { isConnected, connect } = require('../../../../db/mongoose');

module.exports = async (req, res) => {
  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'driver_database_unavailable',
      message: 'Driver profiles are not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  try {
    const drivers = await Driver.find({})
      .sort({ createdAt: -1 })
      .populate('user', 'firstName lastName email')
      .lean();
    res.status(200).json({ data: drivers });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/drivers list] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
