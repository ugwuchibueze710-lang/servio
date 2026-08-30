/**
 * server/api/v2/bookings/respond.js
 *
 * POST /api/v2/bookings/:id/respond - a provider accepting or declining a 'requested' booking.
 * Real authorization: only the AppUser who owns the Business the booking was made against can
 * respond to it. Real state-machine check via bookingStateMachine.js. Also updates the
 * Business's real response-rate/response-time counters (spec section 27) and notifies the
 * customer (spec section 40) - none of this is display-only, it's the actual data those
 * dashboard numbers are computed from.
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');
const { canTransition } = require('../../../utils/bookingStateMachine');
const { notify } = require('../../../utils/notify');

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

    const wasAlreadyResponded = !!booking.respondedAt;
    booking.status = toStatus;
    booking.respondedAt = new Date();
    if (action === 'accept' && quotedPrice !== undefined) {
      const price = Number(quotedPrice);
      if (Number.isFinite(price) && price >= 0) {
        booking.quotedPrice = price;
      }
    }
    await booking.save();

    // Real response-time/response-rate tracking - only the first response counts, so a
    // provider can't inflate their rate by re-responding.
    if (!wasAlreadyResponded) {
      const responseTimeMs = booking.respondedAt.getTime() - booking.createdAt.getTime();
      business.requestsRespondedCount += 1;
      business.totalResponseTimeMs += Math.max(0, responseTimeMs);
      await business.save();
    }

    await notify({
      recipient: booking.customer,
      type: action === 'accept' ? 'request_accepted' : 'request_declined',
      booking: booking._id,
      title: action === 'accept' ? `${business.name} accepted your request` : `${business.name} declined your request`,
      body: action === 'accept' && booking.quotedPrice != null ? `Quoted price: $${booking.quotedPrice}` : undefined,
    });

    res.status(200).json({ booking });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings respond] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
