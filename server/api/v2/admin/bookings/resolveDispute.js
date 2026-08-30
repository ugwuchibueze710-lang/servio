/**
 * server/api/v2/admin/bookings/resolveDispute.js
 *
 * PATCH /api/v2/admin/bookings/:id/resolve-dispute - the operational dispute workflow from spec
 * section 34 (deliberately NOT a legal arbitration system for V1). An admin picks one of:
 *   resolved_provider  - job stands, booking moves to 'confirmed' so the normal payout path
 *                         (server/api/v2/bookings/confirm.js's Stripe transfer) can still run
 *   resolved_customer / refunded / partially_refunded
 *                       - booking is cancelled and, if it was already paid, refunded via Stripe
 *                         (fully for 'refunded'/'resolved_customer', partially for
 *                         'partially_refunded' using the provided refundAmount)
 */
const Booking = require('../../../../models/Booking');
const { isConnected, connect } = require('../../../../db/mongoose');
const { getStripeClient } = require('../../../../utils/stripeClient');
const { notify } = require('../../../../utils/notify');

const RESOLUTION_VALUES = ['resolved_customer', 'resolved_provider', 'refunded', 'partially_refunded'];

module.exports = async (req, res) => {
  const { id } = req.params;
  const { resolution, resolutionNote, refundAmount } = req.body || {};

  if (!RESOLUTION_VALUES.includes(resolution)) {
    res.status(400).json({
      error: 'invalid_resolution',
      message: `resolution must be one of: ${RESOLUTION_VALUES.join(', ')}.`,
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
    if (booking.dispute.status !== 'under_review') {
      res.status(409).json({ error: 'no_active_dispute', message: 'There is no open dispute on this booking.' });
      return;
    }

    booking.dispute.status = resolution;
    booking.dispute.resolutionNote = typeof resolutionNote === 'string' ? resolutionNote.trim() : undefined;
    booking.dispute.resolvedAt = new Date();
    booking.dispute.resolvedBy = req.appUser._id;

    if (resolution === 'resolved_provider') {
      booking.status = 'confirmed';
      booking.confirmedAt = new Date();
    } else {
      // resolved_customer / refunded / partially_refunded - job doesn't stand as billed.
      booking.status = 'cancelled';
      booking.cancelledAt = new Date();
      booking.cancelReason = `Dispute resolved: ${resolution}`;

      const stripe = getStripeClient();
      if (stripe && booking.stripePaymentIntentId && booking.paymentStatus === 'paid') {
        const amount = resolution === 'partially_refunded' ? Number(refundAmount) : undefined;
        try {
          await stripe.refunds.create({
            payment_intent: booking.stripePaymentIntentId,
            ...(Number.isFinite(amount) && amount > 0 ? { amount: Math.round(amount * 100) } : {}),
          });
          booking.paymentStatus = 'refunded';
        } catch (refundErr) {
          // eslint-disable-next-line no-console
          console.error('[admin resolveDispute] Stripe refund failed:', refundErr.message);
        }
      }
    }

    await booking.save();

    await notify({
      recipient: booking.customer,
      type: 'dispute_resolved',
      booking: booking._id,
      title: 'Your dispute has been resolved',
      body: booking.dispute.resolutionNote,
    });

    res.status(200).json({ booking });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin resolveDispute] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
