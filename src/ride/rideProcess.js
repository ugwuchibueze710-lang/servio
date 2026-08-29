/**
 * Transaction process graph for Servio Ride: `ride`.
 *
 * Companion client-side module to `ext/transaction-processes/ride/process.edn`
 * (the actual state machine Sharetribe Flex executes), written in the exact
 * same style as `src/transactions/transactionProcessBooking.js` so it's
 * immediately familiar to anyone who has worked with the existing processes.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS GRAPH LOOKS DIFFERENT FROM A "REQUESTED -> SEARCHING ->
 * DRIVER_ASSIGNED" STATE MACHINE ON ONE TRANSACTION
 * ---------------------------------------------------------------------------
 * Sharetribe Flex ties every transaction to exactly one listing (and
 * therefore one specific provider) from the moment it's created - there is
 * no concept of "create a transaction, then later decide which provider it
 * belongs to". A ride-hailing dispatch loop ("offer to the nearest driver;
 * if they don't answer, offer to the next one") therefore can't be a single
 * transaction that reassigns its provider mid-flight.
 *
 * The Sharetribe-native way to build this, and what this process
 * implements, is: driver selection happens BEFORE transaction creation
 * (server-side, in `server/api-util/rideDispatch.js`, called from
 * `server/api/initiate-privileged.js`), and the transaction is created
 * directly against that one candidate driver's Ride listing. If that driver
 * declines or doesn't respond within the acceptance window
 * (`transition/ride-driver-decline` / `transition/ride-driver-timeout`),
 * the ride is refunded and the app automatically creates a NEW transaction
 * against the next-best candidate - a real retry loop across sequential
 * transactions, not one transaction silently teleporting between drivers.
 * `RIDE_CANDIDATE_STATES` below marks which states are "still trying to
 * find a driver" so the UI can show one continuous "Finding your driver..."
 * screen across that retry loop. `NO_DRIVER_FOUND` (spec section 9) is
 * reached client-side once the candidate list this rideDispatch call
 * returned is exhausted, not by a single transaction transitioning there.
 */

export const transitions = {
  // Customer has picked up/destination and confirmed the ride type; the
  // backend has already chosen the specific driver listing (see above) and
  // creates the transaction against it. A PaymentIntent is authorized for
  // the estimated fare - see server/api-util/ridePricing.js.
  REQUEST_PAYMENT: 'transition/ride-request-payment',

  // Stripe may require a 3-D Secure step client-side before the intent is
  // truly confirmed - mirrors transition/confirm-payment in the other
  // processes.
  CONFIRM_PAYMENT: 'transition/ride-confirm-payment',

  // Customer never completed the card step in time.
  EXPIRE_PAYMENT: 'transition/ride-expire-payment',

  // The assigned driver responds to the incoming request.
  DRIVER_ACCEPT: 'transition/ride-driver-accept',
  DRIVER_DECLINE: 'transition/ride-driver-decline',
  // Automatic, scheduled transition if the driver doesn't respond in time.
  DRIVER_TIMEOUT: 'transition/ride-driver-timeout',

  // Driver-reported trip milestones.
  DRIVER_EN_ROUTE: 'transition/ride-driver-en-route',
  DRIVER_ARRIVED: 'transition/ride-driver-arrived',
  START_TRIP: 'transition/ride-start-trip',

  // Trip is over. Final fare is recomputed server-side from the actual
  // recorded distance/duration (never the original estimate) and the
  // held payment is captured.
  COMPLETE_TRIP: 'transition/ride-complete-trip',
  // Separate step for the driver payout, mirroring how default-booking
  // splits "accept" (capture) from "complete" (payout).
  PAYOUT: 'transition/ride-payout',

  // Cancellations. The fee-bearing variants recompute line items down to
  // just the cancellation fee and capture that reduced amount instead of
  // refunding it - see cancellationLineItems in server/api-util/ridePricing.js.
  // Sharetribe requires a distinct transition name per `:from` state, so
  // these are split per state rather than one name reused three ways -
  // must match ext/transaction-processes/ride/process.edn exactly.
  CANCEL_BY_RIDER_FREE: 'transition/ride-cancel-by-rider-free',
  CANCEL_BY_RIDER_WITH_FEE_FROM_ASSIGNED: 'transition/ride-cancel-by-rider-with-fee-from-assigned',
  CANCEL_BY_RIDER_WITH_FEE_FROM_EN_ROUTE: 'transition/ride-cancel-by-rider-with-fee-from-en-route',
  CANCEL_BY_RIDER_WITH_FEE_FROM_ARRIVED: 'transition/ride-cancel-by-rider-with-fee-from-arrived',
  CANCEL_BY_DRIVER_FROM_ASSIGNED: 'transition/ride-cancel-by-driver-from-assigned',
  CANCEL_BY_DRIVER_FROM_EN_ROUTE: 'transition/ride-cancel-by-driver-from-en-route',

  // Two-sided reviews, identical diamond pattern to the other processes.
  REVIEW_1_BY_PROVIDER: 'transition/ride-review-1-by-provider',
  REVIEW_2_BY_PROVIDER: 'transition/ride-review-2-by-provider',
  REVIEW_1_BY_CUSTOMER: 'transition/ride-review-1-by-customer',
  REVIEW_2_BY_CUSTOMER: 'transition/ride-review-2-by-customer',
  EXPIRE_CUSTOMER_REVIEW_PERIOD: 'transition/ride-expire-customer-review-period',
  EXPIRE_PROVIDER_REVIEW_PERIOD: 'transition/ride-expire-provider-review-period',
  EXPIRE_REVIEW_PERIOD: 'transition/ride-expire-review-period',
};

/**
 * States. Chosen to read as the same vocabulary as the spec's suggested
 * state list (REQUESTED / SEARCHING / DRIVER_ASSIGNED / ...) wherever a
 * single Sharetribe transaction can actually represent that state - see the
 * module comment above for the states that instead live in the client/
 * server retry loop rather than on one transaction.
 */
export const states = {
  INITIAL: 'initial',
  PENDING_PAYMENT: 'pending-payment', // REQUESTED
  PAYMENT_EXPIRED: 'payment-expired',
  AWAITING_DRIVER_ACCEPTANCE: 'awaiting-driver-acceptance', // SEARCHING (this candidate)
  NO_DRIVER_RESPONSE: 'no-driver-response', // this candidate declined/timed out
  DRIVER_ASSIGNED: 'driver-assigned',
  DRIVER_EN_ROUTE_TO_PICKUP: 'driver-en-route-to-pickup',
  DRIVER_ARRIVED: 'driver-arrived',
  TRIP_IN_PROGRESS: 'trip-in-progress',
  TRIP_COMPLETED: 'trip-completed', // fare captured, payout not yet issued
  COMPLETED: 'completed', // driver payout issued
  CANCELLED_BY_RIDER: 'cancelled-by-rider',
  CANCELLED_BY_RIDER_WITH_FEE: 'cancelled-by-rider-with-fee',
  CANCELLED_BY_DRIVER: 'cancelled-by-driver',
  REVIEWED_BY_CUSTOMER: 'reviewed-by-customer',
  REVIEWED_BY_PROVIDER: 'reviewed-by-provider',
  REVIEWED: 'reviewed',
};

/**
 * Xstate-style description of the graph, kept in sync with
 * ext/transaction-processes/ride/process.edn - same convention as
 * transactionProcessBooking.js's `graph` export.
 */
export const graph = {
  id: 'ride/release-1',
  initial: states.INITIAL,
  states: {
    [states.INITIAL]: {
      on: { [transitions.REQUEST_PAYMENT]: states.PENDING_PAYMENT },
    },
    [states.PENDING_PAYMENT]: {
      on: {
        [transitions.EXPIRE_PAYMENT]: states.PAYMENT_EXPIRED,
        [transitions.CONFIRM_PAYMENT]: states.AWAITING_DRIVER_ACCEPTANCE,
      },
    },
    [states.PAYMENT_EXPIRED]: {},
    [states.AWAITING_DRIVER_ACCEPTANCE]: {
      on: {
        [transitions.DRIVER_ACCEPT]: states.DRIVER_ASSIGNED,
        [transitions.DRIVER_DECLINE]: states.NO_DRIVER_RESPONSE,
        [transitions.DRIVER_TIMEOUT]: states.NO_DRIVER_RESPONSE,
        [transitions.CANCEL_BY_RIDER_FREE]: states.CANCELLED_BY_RIDER,
      },
    },
    [states.NO_DRIVER_RESPONSE]: {},
    [states.DRIVER_ASSIGNED]: {
      on: {
        [transitions.DRIVER_EN_ROUTE]: states.DRIVER_EN_ROUTE_TO_PICKUP,
        [transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_ASSIGNED]: states.CANCELLED_BY_RIDER_WITH_FEE,
        [transitions.CANCEL_BY_DRIVER_FROM_ASSIGNED]: states.CANCELLED_BY_DRIVER,
      },
    },
    [states.DRIVER_EN_ROUTE_TO_PICKUP]: {
      on: {
        [transitions.DRIVER_ARRIVED]: states.DRIVER_ARRIVED,
        [transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_EN_ROUTE]: states.CANCELLED_BY_RIDER_WITH_FEE,
        [transitions.CANCEL_BY_DRIVER_FROM_EN_ROUTE]: states.CANCELLED_BY_DRIVER,
      },
    },
    [states.DRIVER_ARRIVED]: {
      on: {
        [transitions.START_TRIP]: states.TRIP_IN_PROGRESS,
        [transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_ARRIVED]: states.CANCELLED_BY_RIDER_WITH_FEE,
      },
    },
    [states.TRIP_IN_PROGRESS]: {
      on: { [transitions.COMPLETE_TRIP]: states.TRIP_COMPLETED },
    },
    [states.TRIP_COMPLETED]: {
      on: { [transitions.PAYOUT]: states.COMPLETED },
    },
    [states.CANCELLED_BY_RIDER]: {},
    [states.CANCELLED_BY_RIDER_WITH_FEE]: {},
    [states.CANCELLED_BY_DRIVER]: {},
    [states.COMPLETED]: {
      on: {
        [transitions.EXPIRE_REVIEW_PERIOD]: states.REVIEWED,
        [transitions.REVIEW_1_BY_CUSTOMER]: states.REVIEWED_BY_CUSTOMER,
        [transitions.REVIEW_1_BY_PROVIDER]: states.REVIEWED_BY_PROVIDER,
      },
    },
    [states.REVIEWED_BY_CUSTOMER]: {
      on: {
        [transitions.REVIEW_2_BY_PROVIDER]: states.REVIEWED,
        [transitions.EXPIRE_PROVIDER_REVIEW_PERIOD]: states.REVIEWED,
      },
    },
    [states.REVIEWED_BY_PROVIDER]: {
      on: {
        [transitions.REVIEW_2_BY_CUSTOMER]: states.REVIEWED,
        [transitions.EXPIRE_CUSTOMER_REVIEW_PERIOD]: states.REVIEWED,
      },
    },
    [states.REVIEWED]: { type: 'final' },
  },
};

// States where the rider-facing UI should render one continuous
// "Finding your driver..." screen, even though it may span more than one
// underlying transaction as candidates are tried in sequence.
export const RIDE_CANDIDATE_STATES = [states.PENDING_PAYMENT, states.AWAITING_DRIVER_ACCEPTANCE];

// Transitions that must go through the backend (server/api/*-privileged.js)
// rather than being called directly from the client SDK - anything that
// touches money or that the client must not be able to fabricate.
// Note: DRIVER_ACCEPT and CANCEL_BY_DRIVER don't touch money, but they're
// still routed through the backend (server/api/ride-transition-privileged.js)
// because they carry a required side effect the client must not be able to
// skip: taking the driver off the market (server/api-util/rideDispatch.js
// lockDriverListing/releaseDriverListing). A transition that "shouldn't be
// trusted to the client alone" isn't only about payment amounts - spec
// section 22.
export const isPrivileged = transition => {
  return [
    transitions.REQUEST_PAYMENT,
    transitions.DRIVER_ACCEPT,
    transitions.COMPLETE_TRIP,
    transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_ASSIGNED,
    transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_EN_ROUTE,
    transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_ARRIVED,
    transitions.CANCEL_BY_DRIVER_FROM_ASSIGNED,
    transitions.CANCEL_BY_DRIVER_FROM_EN_ROUTE,
  ].includes(transition);
};

export const isRefunded = transition => {
  return [
    transitions.EXPIRE_PAYMENT,
    transitions.DRIVER_DECLINE,
    transitions.DRIVER_TIMEOUT,
    transitions.CANCEL_BY_RIDER_FREE,
    transitions.CANCEL_BY_DRIVER_FROM_ASSIGNED,
    transitions.CANCEL_BY_DRIVER_FROM_EN_ROUTE,
  ].includes(transition);
};

export const isCustomerReview = transition => {
  return [transitions.REVIEW_1_BY_CUSTOMER, transitions.REVIEW_2_BY_CUSTOMER].includes(transition);
};

export const isProviderReview = transition => {
  return [transitions.REVIEW_1_BY_PROVIDER, transitions.REVIEW_2_BY_PROVIDER].includes(transition);
};

// Driver-facing "you have something to respond to" states - drives badge/
// notification logic on the driver dashboard duck.
export const statesNeedingDriverAttention = [states.AWAITING_DRIVER_ACCEPTANCE];

// Rider-facing "ride is actively happening" states - used to decide when
// to poll live driver location (see rideDirections.js / RideMap usage in
// RidePage.duck.js) versus when to stop.
export const ACTIVE_TRIP_STATES = [
  states.DRIVER_ASSIGNED,
  states.DRIVER_EN_ROUTE_TO_PICKUP,
  states.DRIVER_ARRIVED,
  states.TRIP_IN_PROGRESS,
];
