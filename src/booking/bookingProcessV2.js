/**
 * src/booking/bookingProcessV2.js
 *
 * Real status vocabulary for the new backend's Booking model - matches
 * server/models/Booking.js's STATUS_VALUES and server/utils/bookingStateMachine.js directly,
 * the same "mirror the real backend rather than force it through a Sharetribe transaction
 * process" approach as src/ride/rideProcessV2.js (see that file's header for the full
 * rationale - it applies here too: this backend's booking lifecycle is genuinely different
 * from Sharetribe's negotiation/booking transaction processes, so a separate, honest
 * vocabulary beats bolting this onto rideProcess.js or an existing Sharetribe process file).
 */

export const bookingStatuses = {
  REQUESTED: 'requested',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const paymentStatuses = {
  UNPAID: 'unpaid',
  PROCESSING: 'processing',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

// Statuses from which either party can still cancel - mirrors bookingStateMachine.js's
// ALLOWED_TRANSITIONS table (every non-terminal status allows a 'cancelled' transition).
export const CANCELLABLE_STATUSES = [
  bookingStatuses.REQUESTED,
  bookingStatuses.ACCEPTED,
  bookingStatuses.SCHEDULED,
  bookingStatuses.IN_PROGRESS,
];

// A booking is payable once the provider has accepted (and therefore quoted a price) - mirrors
// PAYABLE_STATUSES in server/api/v2/payments/createBookingIntent.js.
export const PAYABLE_STATUSES = [
  bookingStatuses.ACCEPTED,
  bookingStatuses.SCHEDULED,
  bookingStatuses.IN_PROGRESS,
  bookingStatuses.COMPLETED,
];

// What a provider can move a booking to next, given its current status - drives the single
// "next step" action button in the inbox. null means there is no further forward transition
// (declined/completed/cancelled are all terminal).
export const PROVIDER_NEXT_STATUS = {
  [bookingStatuses.ACCEPTED]: bookingStatuses.SCHEDULED,
  [bookingStatuses.SCHEDULED]: bookingStatuses.IN_PROGRESS,
  [bookingStatuses.IN_PROGRESS]: bookingStatuses.COMPLETED,
};

export const PROVIDER_NEXT_STATUS_LABEL = {
  [bookingStatuses.SCHEDULED]: 'Mark scheduled',
  [bookingStatuses.IN_PROGRESS]: 'Start job',
  [bookingStatuses.COMPLETED]: 'Mark completed',
};
