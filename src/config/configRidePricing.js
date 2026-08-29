////////////////////////////////////////////////////////////////////////////
// Ride pricing configuration.                                              //
//                                                                          //
// This mirrors the pattern already used for marketplace commission:       //
// `server/api-util/sdk.js` exposes `fetchCommission(sdk)`, which reads a   //
// Console-managed JSON asset so commission can change without a redeploy. //
// `fetchRidePricing(sdk)` below does the same thing for ride fares, with   //
// `DEFAULT_RIDE_PRICING` as the fallback so the feature is testable        //
// before that asset exists in Console.                                    //
//                                                                          //
// IMPORTANT: this module is imported on both the client (for showing a    //
// live fare estimate before the customer confirms) and the server (for    //
// the line items that are actually charged). The client-side estimate is  //
// informational only - `server/api-util/ridePricing.js` recomputes the    //
// real, charged fare from scratch inside the privileged transition, so a  //
// tampered client-side number can never change what the customer is       //
// billed. See section 22 ("never trust the client for fare") of the       //
// integration spec.                                                      //
////////////////////////////////////////////////////////////////////////////

/**
 * Default ride pricing. All amounts are in the marketplace's smallest
 * currency subunit (e.g. cents for USD) to match how Sharetribe's `Money`
 * type and the rest of this app's line-item code already work
 * (see `server/api-util/lineItems.js`).
 *
 * These are real, considered defaults for a US-style local ride-hailing
 * fare (not a placeholder) but are meant to be overridden per-market via
 * the `ride-pricing` Console asset once that asset is created - see
 * `fetchRidePricing` below and RIDE_INTEGRATION_REPORT.md section 6/10.
 */
export const DEFAULT_RIDE_PRICING = {
  currency: 'USD',

  // Flat amount charged for every ride, regardless of distance/time.
  baseFareInSubunits: 250, // $2.50

  // Distance-based rate.
  perMileInSubunits: 125, // $1.25 / mile
  perKmInSubunits: 78, // $0.78 / km (used when the marketplace's unit system is metric)

  // Time-based rate (keeps fares fair when a driver is stuck in traffic).
  perMinuteInSubunits: 22, // $0.22 / minute

  // No ride can cost less than this, however short.
  minimumFareInSubunits: 600, // $6.00

  // Charged to the customer if they cancel after a driver has already been
  // assigned and is en route (see RIDE_STATES.DRIVER_ASSIGNED and later in
  // rideProcess.js). Cancelling before a driver is assigned is always free.
  cancellationFeeInSubunits: 500, // $5.00

  // Optional flat service fee, separate from Servio's percentage commission
  // (which continues to be read from the existing `commission` asset via
  // `fetchCommission`). Set to 0 to disable.
  serviceFeeInSubunits: 0,

  // Demand multiplier applied to the distance+time portion of the fare
  // (never to the base fare or minimum fare floor). 1 = no surge.
  // A real implementation should derive this from live supply/demand
  // (e.g. ratio of online eligible drivers to open ride requests in the
  // service area over a trailing window) rather than a static value -
  // this default of 1 means "surge disabled" until that signal exists.
  surgeMultiplier: 1,

  // Distance/duration below which we don't bother charging the minimum
  // fare distinctly - informational, mirrors minimumFareInSubunits.
  unitSystem: 'imperial', // 'imperial' | 'metric' - drives which per-distance rate is used
};

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

/**
 * Pure fare calculation. No network calls, no side effects - safe to call
 * on both client (for the live estimate shown before confirming) and
 * server (for the actual charge, using the exact same code path so the
 * two numbers can never silently diverge because of a logic bug).
 *
 * @param {Object} params
 * @param {number} params.distanceInMeters - real driving distance from Mapbox Directions
 * @param {number} params.durationInSeconds - real driving duration from Mapbox Directions
 * @param {Object} [pricing] - a ride pricing config; defaults to DEFAULT_RIDE_PRICING
 * @param {number} [pricing.surgeMultiplier] - overrides pricing.surgeMultiplier if provided directly
 * @returns {{
 *   currency: string,
 *   baseFareInSubunits: number,
 *   distanceFareInSubunits: number,
 *   timeFareInSubunits: number,
 *   serviceFeeInSubunits: number,
 *   subtotalBeforeMinimumInSubunits: number,
 *   totalInSubunits: number,
 *   distanceInMeters: number,
 *   durationInSeconds: number,
 *   surgeMultiplier: number,
 *   appliedMinimumFare: boolean,
 * }}
 */
export const calculateRideFare = ({ distanceInMeters, durationInSeconds }, pricing = DEFAULT_RIDE_PRICING) => {
  if (!(distanceInMeters >= 0) || !(durationInSeconds >= 0)) {
    throw new Error(
      'calculateRideFare requires a real, non-negative distanceInMeters and durationInSeconds (from Mapbox Directions). Refusing to fabricate a fare from missing route data.'
    );
  }

  const {
    currency = DEFAULT_RIDE_PRICING.currency,
    baseFareInSubunits = DEFAULT_RIDE_PRICING.baseFareInSubunits,
    perMileInSubunits = DEFAULT_RIDE_PRICING.perMileInSubunits,
    perKmInSubunits = DEFAULT_RIDE_PRICING.perKmInSubunits,
    perMinuteInSubunits = DEFAULT_RIDE_PRICING.perMinuteInSubunits,
    minimumFareInSubunits = DEFAULT_RIDE_PRICING.minimumFareInSubunits,
    serviceFeeInSubunits = DEFAULT_RIDE_PRICING.serviceFeeInSubunits,
    surgeMultiplier = DEFAULT_RIDE_PRICING.surgeMultiplier,
    unitSystem = DEFAULT_RIDE_PRICING.unitSystem,
  } = pricing || {};

  const isImperial = unitSystem !== 'metric';
  const distanceUnits = isImperial
    ? distanceInMeters / METERS_PER_MILE
    : distanceInMeters / METERS_PER_KM;
  const perDistanceRate = isImperial ? perMileInSubunits : perKmInSubunits;

  const distanceFareRaw = distanceUnits * perDistanceRate;
  const timeFareRaw = (durationInSeconds / 60) * perMinuteInSubunits;

  const surgedVariablePortion = (distanceFareRaw + timeFareRaw) * Math.max(1, surgeMultiplier);

  const subtotal = baseFareInSubunits + surgedVariablePortion + serviceFeeInSubunits;
  const roundedSubtotal = Math.round(subtotal);
  const total = Math.max(roundedSubtotal, minimumFareInSubunits);

  return {
    currency,
    baseFareInSubunits: Math.round(baseFareInSubunits),
    distanceFareInSubunits: Math.round(distanceFareRaw * Math.max(1, surgeMultiplier)),
    timeFareInSubunits: Math.round(timeFareRaw * Math.max(1, surgeMultiplier)),
    serviceFeeInSubunits: Math.round(serviceFeeInSubunits),
    subtotalBeforeMinimumInSubunits: roundedSubtotal,
    totalInSubunits: total,
    distanceInMeters,
    durationInSeconds,
    surgeMultiplier: Math.max(1, surgeMultiplier),
    appliedMinimumFare: total > roundedSubtotal,
  };
};

/**
 * The fee charged when a customer cancels after a driver has already been
 * assigned (see rideProcess.js `RIDE_STATES.DRIVER_ASSIGNED` and later).
 * Kept as its own function so `server/api-util/ridePricing.js` can build a
 * one-line-item cancellation charge without recomputing a full fare.
 */
export const calculateCancellationFee = (pricing = DEFAULT_RIDE_PRICING) => ({
  currency: pricing.currency || DEFAULT_RIDE_PRICING.currency,
  totalInSubunits: pricing.cancellationFeeInSubunits ?? DEFAULT_RIDE_PRICING.cancellationFeeInSubunits,
});

/**
 * Fetch the ride pricing configuration from the marketplace's Console
 * assets, exactly like `fetchCommission` in `server/api-util/sdk.js` does
 * for commission. Falls back to DEFAULT_RIDE_PRICING when the
 * `ride-pricing` asset hasn't been created in Console yet, so Phase 1 is
 * testable immediately and switches to the real, admin-editable config the
 * moment that asset is added (see RIDE_INTEGRATION_REPORT.md section 10,
 * Phase 3).
 *
 * @param {Object} sdk - a Sharetribe Flex SDK instance (server-side trusted
 *   sdk, or the client sdk - asset fetching doesn't require elevated
 *   privileges)
 * @returns {Promise<Object>} resolves to a ride pricing config object
 */
export const fetchRidePricing = sdk => {
  // Same shape as `fetchCommission` in `server/api-util/sdk.js`
  // (`sdk.assetsByAlias({ paths: [...], alias: 'latest' })`), just pointed
  // at a ride-specific asset path so it can be managed independently of
  // commission in Console.
  return sdk
    .assetsByAlias({ paths: ['ride/ride-pricing.json'], alias: 'latest' })
    .then(response => {
      const asset = response?.data?.data?.[0];
      const remoteConfig = asset?.attributes?.data;
      return remoteConfig ? { ...DEFAULT_RIDE_PRICING, ...remoteConfig } : DEFAULT_RIDE_PRICING;
    })
    .catch(() => {
      // Asset not created yet (404), or the fetch failed for another
      // reason - fall back to defaults rather than breaking ride pricing
      // entirely. Once `ride/ride-pricing.json` is created in Console
      // (see RIDE_INTEGRATION_REPORT.md / DEPLOYMENT steps), this
      // automatically starts using the real, admin-editable values.
      return DEFAULT_RIDE_PRICING;
    });
};
