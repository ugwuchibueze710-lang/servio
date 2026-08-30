/**
 * server/api/v2/bookings/listMine.js
 *
 * GET /api/v2/bookings/mine - the current AppUser's own bookings, as a customer, newest first.
 * A real, possibly-empty list - no placeholder rows if they haven't booked anything yet.
 */
const Booking = require('../../../models/Booking');
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
    const bookings = await Booking.find({ customer: req.appUser._id })
      .sort({ createdAt: -1 })
      .populate('business', 'name slug profileImageUrl')
      .populate('category', 'name slug')
      .lean();
    res.status(200).json({ data: bookings });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings listMine] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
