/////////////////////////////////////////////////////////////////////////////
// CommonJS mirror of the `transitions` names in src/ride/rideProcess.js.  //
//                                                                         //
// Same cross-module-system constraint as ridePricing.js (see the comment //
// at the top of that file): this server can't `require` an ES-module     //
// `src/` file directly. These string literals MUST be kept identical to  //
// rideProcess.js's `transitions` export and to                          //
// ext/transaction-processes/ride/process.edn's `:name` keywords - all    //
// three are the same transition names by construction, just spelled for //
// three different consumers (client JS, server JS, Sharetribe EDN).      //
/////////////////////////////////////////////////////////////////////////////

module.exports = {
  transitions: {
    REQUEST_PAYMENT: 'transition/ride-request-payment',
    EXPIRE_PAYMENT: 'transition/ride-expire-payment',
    CONFIRM_PAYMENT: 'transition/ride-confirm-payment',
    DRIVER_ACCEPT: 'transition/ride-driver-accept',
    DRIVER_DECLINE: 'transition/ride-driver-decline',
    DRIVER_TIMEOUT: 'transition/ride-driver-timeout',
    CANCEL_BY_RIDER_FREE: 'transition/ride-cancel-by-rider-free',
    DRIVER_EN_ROUTE: 'transition/ride-driver-en-route',
    CANCEL_BY_RIDER_WITH_FEE_FROM_ASSIGNED: 'transition/ride-cancel-by-rider-with-fee-from-assigned',
    CANCEL_BY_RIDER_WITH_FEE_FROM_EN_ROUTE: 'transition/ride-cancel-by-rider-with-fee-from-en-route',
    CANCEL_BY_RIDER_WITH_FEE_FROM_ARRIVED: 'transition/ride-cancel-by-rider-with-fee-from-arrived',
    CANCEL_BY_DRIVER_FROM_ASSIGNED: 'transition/ride-cancel-by-driver-from-assigned',
    CANCEL_BY_DRIVER_FROM_EN_ROUTE: 'transition/ride-cancel-by-driver-from-en-route',
    DRIVER_ARRIVED: 'transition/ride-driver-arrived',
    START_TRIP: 'transition/ride-start-trip',
    COMPLETE_TRIP: 'transition/ride-complete-trip',
    PAYOUT: 'transition/ride-payout',
    REVIEW_1_BY_PROVIDER: 'transition/ride-review-1-by-provider',
    REVIEW_2_BY_PROVIDER: 'transition/ride-review-2-by-provider',
    REVIEW_1_BY_CUSTOMER: 'transition/ride-review-1-by-customer',
    REVIEW_2_BY_CUSTOMER: 'transition/ride-review-2-by-customer',
    EXPIRE_CUSTOMER_REVIEW_PERIOD: 'transition/ride-expire-customer-review-period',
    EXPIRE_PROVIDER_REVIEW_PERIOD: 'transition/ride-expire-provider-review-period',
    EXPIRE_REVIEW_PERIOD: 'transition/ride-expire-review-period',
  },
};
