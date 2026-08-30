/**
 * server/api/v2/bookings/respond.js
 *
 * POST /api/v2/bookings/:id/respond - a provider accepting or declining a 'requested' booking.
 * Real authorization: only the AppUser who owns the Business the booking was made against can
 * respond to it - not just any logged-in provider. Real state-machine check: only bookings
 * currently in 'requested' can be responded to (see server/utils/bookingStateMachine.js).
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');
const { canTransition } = require('../../../utils/bookingStateMachine');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { action, quotedPrice } = req.body || {};

  if (action !== 'accept' && action !== 'decline') {
    res
      .status(400)
      .json({ error: 'invalid_action', message: "action must be 'accept' or 'decline'." });
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
      res.status(403).json({
        error: 'not_authorized',
        message: 'You are not the provider for this booking.',
      });
      return;
    }

    const toStatus = action === 'accept' ? 'accepted' : 'declined';
    if (!canTransition(booking.status, toStatus)) {
      res.status(409).json({
        error: 'invalid_transition',
        message: `This booking is already '${booking.status}' and can no longer be ${action}ed.`,
      });
      return;
    }

    booking.status = toStatus;
    if (action === 'accept' && quotedPrice !== undefined) {
      const price = Number(quotedPrice);
      if (Number.isFinite(price) && price >= 0) {
        booking.quotedPrice = price;
      }
    }
    await booking.save();

    res.status(200).json({ booking });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings respond] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
