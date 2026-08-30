/**
 * server/api/v2/bookings/listInbox.js
 *
 * GET /api/v2/bookings/inbox - the current AppUser's provider inbox: every booking made against
 * any Business they own, newest first. If they don't have a provider profile yet, this is a
 * real, honest empty list with a clear reason - not an error and not someone else's data.
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'booking_database_unavailable',
      message: 'Bookings are not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  try {
    const myBusinesses = await Business.find({ owner: req.appUser._id }).select('_id');
    if (myBusinesses.length === 0) {
      res.status(200).json({
        data: [],
        message: "You don't have a provider profile yet - create one to start receiving requests.",
      });
      return;
    }

    const businessIds = myBusinesses.map(b => b._id);
    const bookings = await Booking.find({ business: { $in: businessIds } })
      .sort({ createdAt: -1 })
      .populate('customer', 'firstName lastName profileImageUrl')
      .populate('category', 'name slug')
      .lean();
    res.status(200).json({ data: bookings });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings listInbox] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
