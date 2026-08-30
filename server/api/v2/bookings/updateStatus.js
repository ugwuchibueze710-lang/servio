/**
 * server/api/v2/bookings/updateStatus.js
 *
 * POST /api/v2/bookings/:id/status - moves a booking forward (scheduled -> in_progress ->
 * completed_pending_confirmation, provider-only) or cancels it (either party, from any
 * non-terminal state). 'confirmed'/'disputed'/'paid_out' are NOT reachable here on purpose -
 * they have their own dedicated endpoints (confirm.js, dispute.js) because each needs extra
 * data (evidence photos, dispute reason, payout logic) beyond a bare status flip. Every
 * transition is checked against server/utils/bookingStateMachine.js and real ownership.
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');
const { canTransition, actorAllowed } = require('../../../utils/bookingStateMachine');
const { notify } = require('../../../utils/notify');
const { computeCancellationFee } = require('../../../utils/cancellationPolicy');
const { getStripeClient } = require('../../../utils/stripeClient');

const VALID_TARGETS = ['scheduled', 'in_progress', 'completed_pending_confirmation', 'cancelled'];
const CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours to confirm/dispute before auto-release

module.exports = async (req, res) => {
  const { id } = req.params;
  const { status, cancelReason, completionEvidencePhotos } = req.body || {};

  if (!VALID_TARGETS.includes(status)) {
    res.status(400).json({
      error: 'invalid_status',
      message: `status must be one of: ${VALID_TARGETS.join(', ')}.`,
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

    const isCustomer = String(booking.customer) === String(req.appUser._id);
    const business = await Business.findById(booking.business);
    const isProvider = !!business && String(business.owner) === String(req.appUser._id);

    if (!isCustomer && !isProvider) {
      res.status(403).json({
        error: 'not_authorized',
        message: 'You are not a party to this booking.',
      });
      return;
    }

    const actorRole = isProvider ? 'provider' : 'customer';
    if (!actorAllowed(status, actorRole)) {
      res.status(403).json({
        error: 'not_authorized',
        message:
          status === 'cancelled'
            ? 'Something went wrong authorizing this cancellation.'
            : 'Only the provider can update the booking to this status.',
      });
      return;
    }

    if (!canTransition(booking.status, status)) {
      res.status(409).json({
        error: 'invalid_transition',
        message: `A booking that is '${booking.status}' cannot move to '${status}'.`,
      });
      return;
    }

    const previousStatus = booking.status;
    booking.status = status;

    if (status === 'completed_pending_confirmation') {
      booking.completedAt = new Date();
      booking.confirmationDeadline = new Date(Date.now() + CONFIRMATION_WINDOW_MS);
      if (Array.isArray(completionEvidencePhotos)) {
        booking.completionEvidencePhotos = completionEvidencePhotos.filter(
          p => p && typeof p.url === 'string'
        );
      }
    }

    let cancellationFeeResult = null;
    if (status === 'cancelled') {
      booking.cancelledAt = new Date();
      booking.cancelledBy = req.appUser._id;
      if (typeof cancelReason === 'string' && cancelReason.trim()) {
        booking.cancelReason = cancelReason.trim();
      }
      if (business) {
        business.cancelledJobsCount += 1;
        await business.save();
      }

      // Real, configurable cancellation-fee policy (spec section 35) - see
      // server/utils/cancellationPolicy.js. Only ever charges when real money was already
      // collected (paymentStatus 'paid') and the CUSTOMER cancelled late.
      const fee = computeCancellationFee(booking, actorRole, previousStatus);
      if (fee) {
        booking.cancellationFee = {
          amount: fee.amount,
          refundAmount: fee.refundAmount,
          feePercent: fee.feePercent,
          windowHours: fee.windowHours,
          reason: fee.reason,
        };

        const stripe = getStripeClient();
        if (stripe && booking.stripePaymentIntentId) {
          try {
            const refund = await stripe.refunds.create({
              payment_intent: booking.stripePaymentIntentId,
              amount: Math.round(fee.refundAmount * 100),
            });
            booking.cancellationFee.stripeRefundId = refund.id;
            booking.paymentStatus = fee.refundAmount > 0 ? 'refunded' : booking.paymentStatus;
          } catch (refundErr) {
            // eslint-disable-next-line no-console
            console.error('[api/v2/bookings updateStatus] cancellation refund failed:', refundErr.message);
            // Leave paymentStatus as-is - a real, visible "refund pending" state rather than a
            // silently swallowed failure. The fee amount is still recorded on the booking.
          }

          if (business && business.stripeConnectAccountId && business.stripeConnectPayoutsEnabled && fee.amount > 0) {
            try {
              const compensationTransfer = await stripe.transfers.create({
                amount: Math.round(fee.amount * 100),
                currency: 'usd',
                destination: business.stripeConnectAccountId,
                transfer_group: `booking_${booking._id}_cancellation`,
                metadata: { bookingId: String(booking._id), type: 'cancellation_fee' },
              });
              booking.cancellationFee.providerCompensationTransferId = compensationTransfer.id;
              booking.cancellationFee.compensationReleased = true;
            } catch (transferErr) {
              // eslint-disable-next-line no-console
              console.error(
                '[api/v2/bookings updateStatus] cancellation compensation transfer failed:',
                transferErr.message
              );
            }
          }
        }
        cancellationFeeResult = booking.cancellationFee;
      }
    }

    await booking.save();

    if (status === 'completed_pending_confirmation') {
      await notify({
        recipient: booking.customer,
        type: 'confirmation_needed',
        booking: booking._id,
        title: `${business.name} marked your job complete`,
        body: 'Please confirm the job was done, or report a problem, within 72 hours.',
      });
    }
    if (status === 'cancelled') {
      const recipient = isProvider ? booking.customer : business && business.owner;
      if (recipient) {
        const feeNote = cancellationFeeResult
          ? ` A $${cancellationFeeResult.amount} cancellation fee applied (${cancellationFeeResult.reason})`
          : '';
        await notify({
          recipient,
          type: 'cancellation',
          booking: booking._id,
          title: 'A booking was cancelled',
          body: `${booking.cancelReason || ''}${feeNote}`.trim() || 'No reason was given.',
        });
      }
    }

    res.status(200).json({ booking, cancellationFee: cancellationFeeResult });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings updateStatus] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
