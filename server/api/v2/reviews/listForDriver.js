/**
 * server/api/v2/reviews/listForDriver.js
 *
 * GET /api/v2/reviews/driver/:driverId - public, real reviews for a driver, newest first
 * (resolved through Driver.user, since reviews of a driver are stored against their AppUser id,
 * not the Driver document id - see server/models/Review.js).
 */
const Review = require('../../../models/Review');
const Driver = require('../../../models/Driver');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { driverId } = req.params;

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'review_database_unavailable',
      message: 'Reviews are not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  try {
    const driver = await Driver.findById(driverId);
    if (!driver) {
      res.status(404).json({ error: 'driver_not_found', message: 'This driver could not be found.', data: [] });
      return;
    }

    const reviews = await Review.find({ subjectUser: driver.user })
      .sort({ createdAt: -1 })
      .populate('author', 'firstName lastName profileImageUrl')
      .lean();
    res.status(200).json({ data: reviews });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/reviews listForDriver] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
