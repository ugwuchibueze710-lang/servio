/**
 * server/api/v2/bookings/confirm.js
 *
 * POST /api/v2/bookings/:id/confirm - the customer confirming a completed job (spec section 33).
 * Real precondition: booking must actually be 'completed_pending_confirmation' - there is no
 * "upload a photo = automatic payout" path (spec explicitly forbids that). Confirming here is
 * what actually releases the provider's payout: computes the real platform fee, and - only if
 * the provider has a working Stripe Connect account and the customer's payment already cleared -
 * creates a real Stripe Transfer. If Connect isn't set up yet, the booking is left 'confirmed'
 * with a clear pending-payout state rather than faking a payout.
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');
const { canTransition } = require('../../../utils/bookingStateMachine');
const { getStripeClient } = require('../../../utils/stripeClient');
const { notify } = require('../../../utils/notify');

const DEFAULT_PLATFORM_FEE_PERCENT = 15;

const platformFeePercent = () => {
  const raw = Number(process.env.PLATFORM_FEE_PERCENT);
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : DEFAULT_PLATFORM_FEE_PERCENT;
};

module.exports = async (req, res) => {
  const { id } = req.params;

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
    if (!canTransition(booking.status, 'confirmed')) {
      res.status(409).json({
        error: 'invalid_transition',
        message: `A booking that is '${booking.status}' cannot be confirmed right now.`,
      });
      return;
    }

    const business = await Business.findById(booking.business);

    booking.status = 'confirmed';
    booking.confirmedAt = new Date();

    const feePercent = platformFeePercent();
    const amount = booking.quotedPrice || 0;
    const platformFeeAmount = Math.round(amount * (feePercent / 100) * 100) / 100;
    const providerPayoutAmount = Math.round((amount - platformFeeAmount) * 100) / 100;
    booking.platformFeeAmount = platformFeeAmount;
    booking.providerPayoutAmount = providerPayoutAmount;

    const stripe = getStripeClient();
    let payoutReleased = false;
    if (
      stripe &&
      business &&
      business.stripeConnectAccountId &&
      business.stripeConnectPayoutsEnabled &&
      booking.paymentStatus === 'paid' &&
      providerPayoutAmount > 0
    ) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(providerPayoutAmount * 100),
          currency: 'usd',
          destination: business.stripeConnectAccountId,
          transfer_group: `booking_${booking._id}`,
          metadata: { bookingId: String(booking._id) },
        });
        booking.stripeTransferId = transfer.id;
        booking.status = 'paid_out';
        booking.paymentStatus = 'paid_out';
        payoutReleased = true;
      } catch (transferErr) {
        // eslint-disable-next-line no-console
        console.error('[api/v2/bookings confirm] Stripe transfer failed:', transferErr.message);
        // Leave the booking 'confirmed' (not paid_out) - a real, visible pending-payout state
        // rather than a silently swallowed failure.
      }
    }

    await booking.save();

    if (business) {
      business.completedJobsCount += 1;
      await business.save();
    }

    if (business) {
      await notify({
        recipient: business.owner,
        type: payoutReleased ? 'payout_released' : 'job_completed',
        booking: booking._id,
        title: payoutReleased
          ? `Payout released for "${booking.description.slice(0, 60)}"`
          : 'Customer confirmed your completed job',
        body: payoutReleased
          ? `$${providerPayoutAmount} transferred to your account.`
          : business.stripeConnectAccountId
          ? 'Payout is pending - check your Stripe Connect account status.'
          : 'Complete Stripe Connect onboarding in your provider settings to receive payouts.',
      });
      await notify({
        recipient: booking.customer,
        type: 'review_request',
        booking: booking._id,
        title: `How did it go with ${business.name}?`,
        body: 'Leave a review to help other customers.',
      });
    }

    res.status(200).json({ booking, payoutReleased });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings confirm] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
