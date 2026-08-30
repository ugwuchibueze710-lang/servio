/**
 * server/api/v2/payments/createRideIntent.js
 *
 * POST /api/v2/payments/rides/:id/intent - the customer paying for a completed ride. Uses the
 * final fare if the trip is done, since that's the real charge amount; refuses to create an
 * intent before the ride has actually completed (no charging for a ride that hasn't happened).
 */
const RideRequest = require('../../../models/RideRequest');
const { getStripeClient } = require('../../../utils/stripeClient');
const { isConnected, connect } = require('../../../db/mongoose');

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
      error: 'ride_database_unavailable',
      message: 'Rides are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const ride = await RideRequest.findById(id);
    if (!ride) {
      res.status(404).json({ error: 'ride_not_found', message: 'This ride could not be found.' });
      return;
    }
    if (String(ride.customer) !== String(req.appUser._id)) {
      res.status(403).json({ error: 'not_authorized', message: 'This is not your ride.' });
      return;
    }
    if (ride.status !== 'trip_completed') {
      res.status(409).json({
        error: 'not_payable',
        message: `A ride that is '${ride.status}' cannot be paid for yet - it hasn't been completed.`,
      });
      return;
    }
    const fare = ride.finalFare || ride.estimatedFare;
    if (!fare || fare <= 0) {
      res.status(409).json({ error: 'no_fare', message: 'This ride has no fare recorded yet.' });
      return;
    }
    if (ride.paymentStatus === 'paid') {
      res.status(409).json({ error: 'already_paid', message: 'This ride has already been paid for.' });
      return;
    }

    let intent;
    if (ride.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(ride.stripePaymentIntentId);
      if (OPEN_INTENT_STATUSES.includes(existing.status) && existing.amount === Math.round(fare * 100)) {
        intent = existing;
      }
    }
    if (!intent) {
      intent = await stripe.paymentIntents.create({
        amount: Math.round(fare * 100),
        currency: 'usd',
        metadata: { rideId: String(ride._id), type: 'ride' },
      });
      ride.stripePaymentIntentId = intent.id;
      ride.paymentStatus = 'processing';
      await ride.save();
    }

    res.status(200).json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/payments createRideIntent] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
