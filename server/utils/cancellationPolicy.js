/**
 * server/utils/cancellationPolicy.js
 *
 * Real, configurable cancellation-fee policy (spec section 35). Kept deliberately simple for
 * V1 (per the spec's "do not overcomplicate V1" list: no complicated bidding/legal-arbitration
 * dispute system) - a single flat window + percentage, both overridable via env vars without a
 * code change:
 *
 *   CANCELLATION_FEE_WINDOW_HOURS - how close to the scheduled job time counts as "late"
 *     (default 24 hours).
 *   CANCELLATION_FEE_PERCENT - the percentage of the quoted price charged as a fee for a late
 *     customer cancellation (default 20). Set to 0 to disable fees entirely.
 *
 * A fee is only ever charged when there is real money already collected to charge it against
 * (booking.paymentStatus === 'paid') and only when the CUSTOMER is the one cancelling - a
 * provider cancelling never charges the customer a fee (that's reflected instead in the
 * provider's own real cancelledJobsCount / cancellation-rate metric). A job already in progress
 * counts as "late" regardless of the scheduled date, since the provider has already committed
 * real time to it.
 */
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_FEE_PERCENT = 20;

const windowHours = () => {
  const raw = Number(process.env.CANCELLATION_FEE_WINDOW_HOURS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_WINDOW_HOURS;
};

const feePercent = () => {
  const raw = Number(process.env.CANCELLATION_FEE_PERCENT);
  return Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : DEFAULT_FEE_PERCENT;
};

/**
 * @param {Object} booking - a real Booking document (or plain object with the same shape)
 * @param {'customer'|'provider'} cancellingActorRole
 * @param {string} previousStatus - booking.status BEFORE being set to 'cancelled'
 * @returns {null | { amount, refundAmount, feePercent, windowHours, reason }}
 */
const computeCancellationFee = (booking, cancellingActorRole, previousStatus) => {
  if (cancellingActorRole !== 'customer') return null;
  if (booking.paymentStatus !== 'paid') return null;
  if (!booking.quotedPrice || booking.quotedPrice <= 0) return null;

  const percent = feePercent();
  if (percent <= 0) return null;

  const hours = windowHours();
  const jobAlreadyStarted = previousStatus === 'in_progress' || previousStatus === 'completed_pending_confirmation';
  const hoursUntilJob = booking.requestedDate
    ? (new Date(booking.requestedDate).getTime() - Date.now()) / (60 * 60 * 1000)
    : null;
  const withinWindow = hoursUntilJob !== null && hoursUntilJob <= hours;

  if (!jobAlreadyStarted && !withinWindow) {
    // Either no scheduled date was ever set, or it's comfortably in the future - a free
    // cancellation, matching the spec's intent that fees are for LATE cancellations only.
    return null;
  }

  const amount = Math.round(booking.quotedPrice * (percent / 100) * 100) / 100;
  const refundAmount = Math.round((booking.quotedPrice - amount) * 100) / 100;

  return {
    amount,
    refundAmount,
    feePercent: percent,
    windowHours: hours,
    reason: jobAlreadyStarted
      ? 'Job was already in progress when cancelled.'
      : `Cancelled within ${hours} hours of the scheduled time.`,
  };
};

module.exports = { computeCancellationFee, windowHours, feePercent };
