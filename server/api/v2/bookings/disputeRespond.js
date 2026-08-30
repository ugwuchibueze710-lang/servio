/**
 * server/api/v2/bookings/disputeRespond.js
 *
 * POST /api/v2/bookings/:id/dispute/respond - the provider's side of the story (spec section
 * 34: "the provider can respond"). Does not change the booking status - resolution is an admin
 * action (see server/api/v2/admin/bookings/resolveDispute.js).
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { response } = req.body || {};
  const trimmedResponse = typeof response === 'string' ? response.trim() : '';

  if (trimmedResponse.length < 5) {
    res.status(400).json({ error: 'invalid_response', message: 'Please provide a response.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'booking_database_unavailable',
      message: 'Bookings are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'booking_not_found', message: 'This booking could not be found.' });
      return;
    }
    const business = await Business.findById(booking.business);
    if (!business || String(business.owner) !== String(req.appUser._id)) {
      res.status(403).json({ error: 'not_authorized', message: 'You are not the provider for this booking.' });
      return;
    }
    if (booking.dispute.status !== 'under_review') {
      res.status(409).json({ error: 'no_active_dispute', message: 'There is no open dispute on this booking.' });
      return;
    }

    booking.dispute.providerResponse = trimmedResponse;
    await booking.save();

    res.status(200).json({ booking });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings disputeRespond] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
