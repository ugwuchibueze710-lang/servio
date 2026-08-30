/**
 * server/utils/bookingStateMachine.js
 *
 * The real status lifecycle for a Booking (spec section 6/7): requested -> accepted/declined ->
 * scheduled -> in_progress -> completed, with cancellation possible from any non-terminal state.
 * Both server/api/v2/bookings/respond.js and updateStatus.js check every transition against this
 * table (and against who's allowed to make it) rather than trusting whatever the client sends -
 * there is no "just set the status field" path anywhere.
 */
const ALLOWED_TRANSITIONS = {
  requested: ['accepted', 'declined', 'cancelled'],
  accepted: ['scheduled', 'cancelled'],
  declined: [],
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// Who is allowed to move a booking INTO this status. 'provider' = the Business owner,
// 'customer' = the AppUser who requested it, 'either' = whoever it is (only cancellation).
const ACTOR_FOR_STATUS = {
  accepted: 'provider',
  declined: 'provider',
  scheduled: 'provider',
  in_progress: 'provider',
  completed: 'provider',
  cancelled: 'either',
};

const canTransition = (fromStatus, toStatus) => (ALLOWED_TRANSITIONS[fromStatus] || []).includes(toStatus);

const actorAllowed = (toStatus, actorRole) => {
  const required = ACTOR_FOR_STATUS[toStatus];
  return required === 'either' || required === actorRole;
};

module.exports = { ALLOWED_TRANSITIONS, canTransition, actorAllowed };
