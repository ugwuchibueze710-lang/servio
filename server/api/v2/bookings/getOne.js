/**
 * server/api/v2/bookings/getOne.js
 *
 * GET /api/v2/bookings/:id - the full "Project Passport" record for one booking: request,
 * quote, messages status, payment/payout state, completion evidence, dispute, all in one place
 * (spec section 51). Only the booking's customer or the business owner may view it - checked
 * against the real database, not trusted from the client.
 */
const mongoose = require('mongoose');
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: 'booking_not_found', message: 'This booking could not be found.' });
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
    const booking = await Booking.findById(id)
      .populate('business', 'name slug profileImageUrl owner contactPhone publishPhone stripeConnectAccountId stripeConnectPayoutsEnabled')
      .populate('category', 'name slug')
      .populate('customer', 'firstName lastName profileImageUrl');

    if (!booking) {
      res.status(404).json({ error: 'booking_not_found', message: 'This booking could not be found.' });
      return;
    }

    const requesterId = String(req.appUser._id);
    const isCustomer = String(booking.customer._id) === requesterId;
    const isProvider = booking.business && String(booking.business.owner) === requesterId;

    if (!isCustomer && !isProvider) {
      res.status(403).json({ error: 'not_authorized', message: 'You are not a party to this booking.' });
      return;
    }

    res.status(200).json({ booking, viewerRole: isProvider ? 'provider' : 'customer' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings getOne] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
