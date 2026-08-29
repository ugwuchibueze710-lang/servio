/////////////////////////////////////////////////////////////////////////////
// Dedicated privileged-initiate endpoint for Ride.                        //
//                                                                         //
// Deliberately NOT folded into the existing `initiate-privileged.js`      //
// (used by every other Servio service) - that file assumes the client     //
// already knows which listing it's transacting against, which is true    //
// for booking a specific provider's listing but not for ride dispatch,    //
// where the SERVER picks the driver. Keeping this separate means the      //
// existing negotiation/booking/purchase flows other services rely on     //
// are not touched by any of this (see "do not break Servio", spec        //
// section 25). Registered as its own route in server/apiRouter.js.        //
/////////////////////////////////////////////////////////////////////////////

const {
  createCookieTokenStore,
  getSdk,
  getTrustedSdk,
  handleError,
  serialize,
  fetchCommission,
} = require('../api-util/sdk');
const { fetchRidePricing, calculateRideFare, rideLineItems } = require('../api-util/ridePricing');
const { findCandidateDrivers, selectBestCandidate } = require('../api-util/rideDispatch');

module.exports = (req, res) => {
  const { isSpeculative, orderData, bodyParams, queryParams } = req.body || {};
  const { pickup, destination, distanceInMeters, durationInSeconds, rideType, excludeListingIds } =
    orderData || {};

  if (!pickup || !destination || !(distanceInMeters >= 0) || !(durationInSeconds >= 0)) {
    const error = new Error(
      'ride-initiate-privileged requires a real pickup, destination, distanceInMeters and durationInSeconds (from Mapbox Directions) in orderData.'
    );
    error.status = 400;
    return handleError(res, error);
  }

  const tokenStore = createCookieTokenStore(req, res);
  const sdk = getSdk(req, res, tokenStore);

  findCandidateDrivers(sdk, pickup, { rideType, excludeListingIds })
    .then(candidates => {
      const chosen = selectBestCandidate(candidates);
      if (!chosen) {
        // Real "no driver available" state - not swallowed, not faked as
        // success. The client (RidePage.duck.js) surfaces this as
        // NO_DRIVER_FOUND per spec section 9.
        const error = new Error('No eligible drivers are currently online near this pickup location.');
        error.status = 409;
        error.data = { code: 'NO_DRIVER_FOUND' };
        throw error;
      }

      return Promise.all([Promise.resolve(chosen), fetchCommission(sdk), fetchRidePricing(sdk)]);
    })
    .then(([chosenListing, commissionResponse, pricing]) => {
      const commissionAsset = commissionResponse?.data?.data?.[0];
      const { providerCommission, customerCommission } =
        commissionAsset?.type === 'jsonAsset' ? commissionAsset.attributes.data : {};

      const fareBreakdown = calculateRideFare({ distanceInMeters, durationInSeconds }, pricing);
      const lineItems = rideLineItems(fareBreakdown, providerCommission, customerCommission);

      return getTrustedSdk(req, res, tokenStore).then(trustedSdk => {
        const body = {
          ...bodyParams,
          params: {
            ...bodyParams.params,
            listingId: chosenListing.id,
            lineItems,
            protectedData: {
              ...(bodyParams.params?.protectedData || {}),
              pickup,
              destination,
              estimatedDistanceMeters: distanceInMeters,
              estimatedDurationSeconds: durationInSeconds,
            },
            metadata: {
              ...(bodyParams.params?.metadata || {}),
              fareBreakdown,
            },
          },
        };

        return isSpeculative
          ? trustedSdk.transactions.initiateSpeculative(body, queryParams)
          : trustedSdk.transactions.initiate(body, queryParams);
      });
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
