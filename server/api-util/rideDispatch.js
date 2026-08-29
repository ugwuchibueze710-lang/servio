/////////////////////////////////////////////////////////////////////////////
// Real nearest-eligible-driver dispatch.                                  //
//                                                                         //
// Uses Sharetribe's own listing search with the `origin` parameter,      //
// which is the same distance-sort mechanism already referenced in        //
// `src/config/configMaps.js` (`sortSearchByDistance`) for the regular     //
// search page - not a new geo-search system. See                        //
// RIDE_INTEGRATION_REPORT.md section 5 for why driver eligibility        //
// (`isOnline`) has to be public+indexed data rather than private: the    //
// end-user SDK used here cannot query another user's private data at     //
// all, only the Integration API can, and standing up a second API        //
// credential just for this was judged not worth it for Phase 1 - see     //
// DEPLOYMENT_RIDE.md.                                                    //
/////////////////////////////////////////////////////////////////////////////

const DEFAULT_SEARCH_RADIUS_METERS = 8000; // ~5 miles
const MAX_CANDIDATES = 5;

/**
 * Find eligible, online Ride driver listings near a pickup point, nearest
 * first. This is a normal (non-privileged) public search - no elevated
 * credentials required, same as any other listing search in the app.
 *
 * @param {Object} sdk - Sharetribe Flex SDK instance
 * @param {{lat:number,lng:number}} pickup
 * @param {Object} [options]
 * @param {string} [options.rideType] - matches LISTING_PUBLIC_DATA.RIDE_TYPE
 * @param {Array<string>} [options.excludeListingIds] - candidates already tried and declined/timed out for this ride request
 * @returns {Promise<Array<Object>>} listing resources, nearest first
 */
const findCandidateDrivers = (sdk, pickup, options = {}) => {
  if (!pickup || typeof pickup.lat !== 'number' || typeof pickup.lng !== 'number') {
    return Promise.reject(Object.assign(new Error('findCandidateDrivers requires a real pickup {lat,lng}.'), { status: 400 }));
  }

  const { rideType, excludeListingIds = [] } = options;
  const rideTypeFilterMaybe = rideType ? { pub_rideType: rideType } : {};

  return sdk.listings
    .query({
      pub_listingType: 'ride-driver',
      pub_isOnline: true,
      origin: `${pickup.lat},${pickup.lng}`,
      ...rideTypeFilterMaybe,
      perPage: MAX_CANDIDATES + excludeListingIds.length,
    })
    .then(response => {
      const listings = response?.data?.data || [];
      return listings
        .filter(listing => !excludeListingIds.includes(listing.id.uuid))
        .slice(0, MAX_CANDIDATES);
    });
};

/**
 * Pick the single best candidate for this ride. Phase 1 is nearest-first
 * (what `findCandidateDrivers`'s `origin` sort already returns) - the
 * "Smart Match" scoring the spec asks for (section 15: rating, reliability,
 * vehicle suitability) is a real follow-on once Ride listings have review/
 * completion-rate history to score against; scoring on data that doesn't
 * exist yet would be the fabrication the spec explicitly forbids. This
 * function is the single seam where that scoring gets added later without
 * touching the dispatch/retry loop around it.
 */
const selectBestCandidate = candidates => (candidates && candidates.length > 0 ? candidates[0] : null);

/**
 * After a driver accepts a ride (transition/ride-driver-accept), take them
 * off the market so a second, concurrent dispatch can't also match them.
 * Uses the driver's OWN trusted sdk (they are the actor making this
 * transition, so this is exactly the access `sdk.ownListings.update` is
 * meant for - no elevated/integration credentials needed).
 *
 * NOTE - documented residual limitation: this happens as a follow-up call
 * after the transition commits, not atomically with it. Under real
 * concurrent load there is a narrow race window where two ride requests
 * could both see this driver as a candidate before this flip lands. See
 * DEPLOYMENT_RIDE.md's Phase 3 testing checklist ("duplicate acceptance",
 * spec section 27) - closing that window fully needs either an Integration
 * API-based compare-and-set or a small queue in front of dispatch, and
 * should be load-tested before relying on it in production.
 */
const lockDriverListing = (trustedSdk, driverListingId, activeRideTransactionId) => {
  return trustedSdk.ownListings.update({
    id: driverListingId,
    publicData: { isOnline: false },
    privateData: { activeRideTransactionId },
  });
};

/** Mirror of lockDriverListing, called once a ride ends (completed or cancelled). */
const releaseDriverListing = (trustedSdk, driverListingId) => {
  return trustedSdk.ownListings.update({
    id: driverListingId,
    publicData: { isOnline: true },
    privateData: { activeRideTransactionId: null },
  });
};

module.exports = {
  DEFAULT_SEARCH_RADIUS_METERS,
  findCandidateDrivers,
  selectBestCandidate,
  lockDriverListing,
  releaseDriverListing,
};
