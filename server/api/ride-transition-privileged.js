/////////////////////////////////////////////////////////////////////////////
// Dedicated privileged-transition endpoint for Ride.                      //
//                                                                         //
// Kept separate from the existing `transition-privileged.js` for the      //
// same reason as ride-initiate-privileged.js: Ride's driver-lock side     //
// effects and final-fare recomputation are specific to this process and  //
// have no reason to run through - or risk affecting - the negotiation/   //
// booking/purchase logic every other Servio service already depends on.  //
/////////////////////////////////////////////////////////////////////////////

const {
  createCookieTokenStore,
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');
const { fetchRidePricing, calculateRideFare, rideLineItems, cancellationLineItems } = require('../api-util/ridePricing');
const { lockDriverListing, releaseDriverListing } = require('../api-util/rideDispatch');
const { transitions } = require('../api-util/rideTransitionNames');

const transactionPromise = (sdk, id) => sdk.transactions.show({ id, include: ['listing'] });

const getDriverListingId = transactionShowAPIData => {
  const { data, included } = transactionShowAPIData;
  const listingRef = data.relationships?.listing?.data;
  const listing = included?.find(i => i.type === 'listing' && i.id.uuid === listingRef?.id.uuid);
  return listing?.id;
};

module.exports = (req, res) => {
  const { orderData, bodyParams, queryParams } = req.body || {};
  const transitionName = bodyParams?.transition;
  const transactionId = bodyParams?.id;

  const tokenStore = createCookieTokenStore(req, res);
  const sdk = getSdk(req, res, tokenStore);

  transactionPromise(sdk, transactionId)
    .then(showResponse => {
      const txData = showResponse.data;
      const driverListingId = getDriverListingId(txData);

      const isDriverAccept = transitionName === transitions.DRIVER_ACCEPT;
      const isCompleteTrip = transitionName === transitions.COMPLETE_TRIP;
      const isCancelWithFee = [
        transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_ASSIGNED,
        transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_EN_ROUTE,
        transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_ARRIVED,
      ].includes(transitionName);
      const isCancelByDriver = [
        transitions.CANCEL_BY_DRIVER_FROM_ASSIGNED,
        transitions.CANCEL_BY_DRIVER_FROM_EN_ROUTE,
      ].includes(transitionName);

      const needsRecomputedFare = isCompleteTrip || isCancelWithFee;

      const lineItemsPromise = !needsRecomputedFare
        ? Promise.resolve(null)
        : Promise.all([fetchCommission(sdk), fetchRidePricing(sdk)]).then(
            ([commissionResponse, pricing]) => {
              const commissionAsset = commissionResponse?.data?.data?.[0];
              const { providerCommission, customerCommission } =
                commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

              if (isCancelWithFee) {
                return cancellationLineItems(pricing, providerCommission, customerCommission);
              }

              // isCompleteTrip: recompute from the ACTUAL trip, never the
              // original estimate - orderData carries the real distance/
              // duration recorded by the driver client during the trip
              // (see RidePage/DriverRidePage duck "end trip" action).
              const { actualDistanceInMeters, actualDurationInSeconds } = orderData || {};
              if (!(actualDistanceInMeters >= 0) || !(actualDurationInSeconds >= 0)) {
                const error = new Error(
                  'ride-complete-trip requires the actually-recorded actualDistanceInMeters/actualDurationInSeconds, not the original estimate.'
                );
                error.status = 400;
                throw error;
              }
              const fareBreakdown = calculateRideFare(
                { distanceInMeters: actualDistanceInMeters, durationInSeconds: actualDurationInSeconds },
                pricing
              );
              return rideLineItems(fareBreakdown, providerCommission, customerCommission);
            }
          );

      return Promise.all([lineItemsPromise, getTrustedSdk(req, res, tokenStore)]).then(
        ([lineItems, trustedSdk]) => {
          const lineItemsMaybe = lineItems ? { lineItems } : {};
          const body = {
            ...bodyParams,
            params: { ...bodyParams.params, ...lineItemsMaybe },
          };

          return trustedSdk.transactions.transition(body, queryParams).then(apiResponse => {
            // Side effects, best-effort: the Sharetribe transition already
            // committed by this point, so a failure here should not be
            // reported to the client as a failed ride action - it's
            // logged and left for Phase 3's monitoring/reconciliation
            // rather than silently retried inline (spec section 23).
            let sideEffect = Promise.resolve();
            if (driverListingId && (isDriverAccept)) {
              sideEffect = lockDriverListing(trustedSdk, driverListingId, transactionId);
            } else if (driverListingId && (isCompleteTrip || isCancelWithFee || isCancelByDriver)) {
              sideEffect = releaseDriverListing(trustedSdk, driverListingId);
            }

            return sideEffect
              .catch(sideEffectError => {
                // eslint-disable-next-line no-console
                console.error('ride-transition-privileged: driver lock/release side effect failed', sideEffectError);
              })
              .then(() => apiResponse);
          });
        }
      );
    })
    .then(apiResponse => {
      const { status, statusText, data } = apiResponse;
      res
        .status(status)
        .set('Content-Type', 'application/transit+json')
        .send(serialize({ status, statusText, data }))
        .end();
    })
    .catch(e => {
      handleError(res, e);
    });
};
