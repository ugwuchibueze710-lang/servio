/**
 * server/api/v2/payments/webhook.js
 *
 * POST /api/v2/payments/webhook - Stripe's own server-to-server confirmation that a payment
 * actually succeeded or failed. This is the real source of truth for `paymentStatus` - the
 * client confirming a card on the frontend is never trusted by itself; only this signed webhook
 * (verified against STRIPE_WEBHOOK_SECRET) flips a Booking/RideRequest to 'paid'. Mounted in
 * apiRouter.js with express.raw() (NOT express.json()) ahead of the router's normal JSON body
 * parsing, because Stripe's signature check needs the exact raw request bytes.
 */
const Booking = require('../../../models/Booking');
const RideRequest = require('../../../models/RideRequest');
const { getStripeClient } = require('../../../utils/stripeClient');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    res.status(503).json({
      error: 'payments_unavailable',
      message: 'Payment webhooks are not configured yet (STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET unset).',
    });
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), webhookSecret);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/payments webhook] signature verification failed:', err.message);
    res.status(400).json({ error: 'invalid_signature', message: 'Webhook signature verification failed.' });
    return;
  }

  if (event.type !== 'payment_intent.succeeded' && event.type !== 'payment_intent.payment_failed') {
    // Real Stripe accounts send many event types; only these two are relevant here. Acknowledge
    // and ignore the rest rather than erroring on something we don't need to act on.
    res.status(200).json({ received: true, ignored: event.type });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    // Stripe will retry the webhook on a non-2xx, so a real 503 here (rather than swallowing the
    // event) means the payment status update isn't silently lost if the database is briefly down.
    res.status(503).json({ error: 'database_unavailable', message: 'Database unreachable, please retry.' });
    return;
  }

  const paymentIntentId = event.data.object.id;
  const newStatus = event.type === 'payment_intent.succeeded' ? 'paid' : 'failed';

  try {
    const booking = await Booking.findOne({ stripePaymentIntentId: paymentIntentId });
    if (booking) {
      booking.paymentStatus = newStatus;
      await booking.save();
      res.status(200).json({ received: true, updated: 'booking', id: String(booking._id) });
      return;
    }

    const ride = await RideRequest.findOne({ stripePaymentIntentId: paymentIntentId });
    if (ride) {
      ride.paymentStatus = newStatus;
      await ride.save();
      res.status(200).json({ received: true, updated: 'ride', id: String(ride._id) });
      return;
    }

    // A payment intent that doesn't match any booking/ride we know about - acknowledge it (so
    // Stripe stops retrying) but flag it, since this shouldn't normally happen.
    // eslint-disable-next-line no-console
    console.warn('[api/v2/payments webhook] no booking/ride found for payment intent:', paymentIntentId);
    res.status(200).json({ received: true, updated: null });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/payments webhook] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
  }
};
