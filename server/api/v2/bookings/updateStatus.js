/**
 * server/api/v2/bookings/updateStatus.js
 *
 * POST /api/v2/bookings/:id/status - moves a booking forward (scheduled -> in_progress ->
 * completed, provider-only) or cancels it (either party, from any non-terminal state). Every
 * transition is checked against server/utils/bookingStateMachine.js and against real ownership -
 * there's no client-trusted "just set the status".
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');
const { canTransition, actorAllowed } = require('../../../utils/bookingStateMachine');

const VALID_TARGETS = ['scheduled', 'in_progress', 'completed', 'cancelled'];

module.exports = async (req, res) => {
  const { id } = req.params;
  const { status, cancelReason } = req.body || {};

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

    booking.status = status;
    if (status === 'completed') {
      booking.completedAt = new Date();
    }
    if (status === 'cancelled') {
      booking.cancelledAt = new Date();
      if (typeof cancelReason === 'string' && cancelReason.trim()) {
        booking.cancelReason = cancelReason.trim();
      }
    }
    await booking.save();

    res.status(200).json({ booking });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings updateStatus] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
