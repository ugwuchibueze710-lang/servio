/**
 * server/api/v2/bookings/dispute.js
 *
 * POST /api/v2/bookings/:id/dispute - customer "Report a Problem" on a job pending confirmation
 * (spec section 34). Moves the booking to 'disputed' and blocks payout (confirm.js/the payout
 * path is unreachable from 'disputed' until an admin resolves it) - a completion photo is
 * evidence, never automatic proof the customer is satisfied.
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');
const { canTransition } = require('../../../utils/bookingStateMachine');
const { notify } = require('../../../utils/notify');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

  if (trimmedReason.length < 10) {
    res.status(400).json({
      error: 'invalid_reason',
      message: 'Please describe the problem (at least 10 characters).',
    });
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
    if (String(booking.customer) !== String(req.appUser._id)) {
      res.status(403).json({ error: 'not_authorized', message: 'This is not your booking.' });
      return;
    }
    if (!canTransition(booking.status, 'disputed')) {
      res.status(409).json({
        error: 'invalid_transition',
        message: `A booking that is '${booking.status}' cannot be disputed right now.`,
      });
      return;
    }

    booking.status = 'disputed';
    booking.dispute = {
      status: 'under_review',
      reason: trimmedReason,
      reportedBy: req.appUser._id,
      reportedAt: new Date(),
    };
    await booking.save();

    const business = await Business.findById(booking.business);
    if (business) {
      await notify({
        recipient: business.owner,
        type: 'dispute_opened',
        booking: booking._id,
        title: 'A customer reported a problem with a job',
        body: trimmedReason.slice(0, 140),
      });
    }

    res.status(200).json({ booking });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings dispute] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
