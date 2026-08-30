/**
 * server/utils/bookingStateMachine.js
 *
 * The real status lifecycle for a Booking / Project Passport (spec section 36):
 *   requested -> accepted/declined -> scheduled -> in_progress
 *     -> completed_pending_confirmation -> confirmed -> paid_out
 *   (or) disputed, cancelled
 *
 * 'paid_out' is never reachable through the generic actor-driven transitions below - it is only
 * ever set internally once a real Stripe transfer succeeds (see server/api/v2/bookings/confirm.js
 * and the payments webhook), which is why it has no entry in ACTOR_FOR_STATUS.
 */
const ALLOWED_TRANSITIONS = {
  requested: ['accepted', 'declined', 'cancelled'],
  accepted: ['scheduled', 'in_progress', 'cancelled'],
  declined: [],
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed_pending_confirmation', 'cancelled'],
  completed_pending_confirmation: ['confirmed', 'disputed'],
  confirmed: ['paid_out'],
  disputed: ['confirmed', 'cancelled'],
  paid_out: [],
  cancelled: [],
};

// Who is allowed to move a booking INTO this status via the normal customer/provider-facing
// endpoints. 'provider' = the Business owner, 'customer' = the AppUser who requested it,
// 'either' = whoever it is (cancellation only). Statuses with no entry here (paid_out) are
// intentionally unreachable through actorAllowed - they're set directly by internal code.
const ACTOR_FOR_STATUS = {
  accepted: 'provider',
  declined: 'provider',
  scheduled: 'provider',
  in_progress: 'provider',
  completed_pending_confirmation: 'provider',
  confirmed: 'customer',
  disputed: 'customer',
  cancelled: 'either',
};

const canTransition = (fromStatus, toStatus) => (ALLOWED_TRANSITIONS[fromStatus] || []).includes(toStatus);

const actorAllowed = (toStatus, actorRole) => {
  const required = ACTOR_FOR_STATUS[toStatus];
  return required === 'either' || required === actorRole;
};

module.exports = { ALLOWED_TRANSITIONS, ACTOR_FOR_STATUS, canTransition, actorAllowed };
