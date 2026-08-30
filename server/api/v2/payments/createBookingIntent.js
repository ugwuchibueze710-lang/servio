/**
 * server/api/v2/payments/createBookingIntent.js
 *
 * POST /api/v2/payments/bookings/:id/intent - the customer paying for an accepted booking.
 * Real preconditions, not a "pay any time" free-for-all: the booking must be theirs, must have
 * actually been accepted by the provider (with a real quoted price on it), and must not already
 * be paid. Reuses an existing, still-open PaymentIntent instead of creating a duplicate one on
 * every retry/page-reload.
 */
const Booking = require('../../../models/Booking');
const { getStripeClient } = require('../../../utils/stripeClient');
const { isConnected, connect } = require('../../../db/mongoose');

const PAYABLE_STATUSES = ['accepted', 'scheduled', 'in_progress', 'completed_pending_confirmation'];
const OPEN_INTENT_STATUSES = ['requires_payment_method', 'requires_confirmation', 'requires_action'];

module.exports = async (req, res) => {
  const { id } = req.params;

  const stripe = getStripeClient();
  if (!stripe) {
    res.status(503).json({
      error: 'payments_unavailable',
      message: 'Payments are not configured yet (STRIPE_SECRET_KEY is unset).',
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
    if (!PAYABLE_STATUSES.includes(booking.status)) {
      res.status(409).json({
        error: 'not_payable',
        message: `A booking that is '${booking.status}' cannot be paid for yet.`,
      });
      return;
    }
    if (!booking.quotedPrice || booking.quotedPrice <= 0) {
      res.status(409).json({
        error: 'no_quoted_price',
        message: 'The provider has not quoted a price for this booking yet.',
      });
      return;
    }
    if (booking.paymentStatus === 'paid') {
      res.status(409).json({ error: 'already_paid', message: 'This booking has already been paid for.' });
      return;
    }

    let intent;
    if (booking.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
      if (OPEN_INTENT_STATUSES.includes(existing.status) && existing.amount === Math.round(booking.quotedPrice * 100)) {
        intent = existing;
      }
    }
    if (!intent) {
      intent = await stripe.paymentIntents.create({
        amount: Math.round(booking.quotedPrice * 100),
        currency: 'usd',
        metadata: { bookingId: String(booking._id), type: 'booking' },
      });
      booking.stripePaymentIntentId = intent.id;
      booking.paymentStatus = 'processing';
      await booking.save();
    }

    res.status(200).json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/payments createBookingIntent] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
