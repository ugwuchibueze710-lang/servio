/**
 * server/utils/rideFare.js
 *
 * The new backend's ride fare calculation. Deliberately a byte-for-byte numerical port of
 * `calculateRideFare` in src/config/configRidePricing.js (the live Sharetribe-based
 * implementation) and `server/api-util/ridePricing.js` (its server-side counterpart) - see
 * MIGRATION_PLAN.md for why this exists as a third copy rather than a shared import: the
 * client bundle and this server don't share a module system (ES modules vs plain `require`), and
 * `server/api-util/ridePricing.js` additionally depends on `sharetribe-flex-sdk`'s `Money` type
 * and `fetchRidePricing(sdk)` (a Sharetribe Console asset), neither of which exists once a ride is
 * being served by this backend instead. The math itself must stay numerically identical to both -
 * this is the same "never trust the client for fare" rule (spec section 22), just enforced against
 * MongoDB-backed rides instead of a Sharetribe transaction.
 */
const DEFAULT_RIDE_PRICING = {
  currency: 'USD',
  baseFareInSubunits: 250,
  perMileInSubunits: 125,
  perKmInSubunits: 78,
  perMinuteInSubunits: 22,
  minimumFareInSubunits: 600,
  cancellationFeeInSubunits: 500,
  serviceFeeInSubunits: 0,
  surgeMultiplier: 1,
  unitSystem: 'imperial',
};

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

const calculateRideFare = ({ distanceInMeters, durationInSeconds }, pricing = DEFAULT_RIDE_PRICING) => {
  if (!(distanceInMeters >= 0) || !(durationInSeconds >= 0)) {
    const error = new Error(
      'calculateRideFare requires a real, non-negative distanceInMeters/durationInSeconds. Refusing to fabricate a fare from missing route data.'
    );
    error.status = 400;
    throw error;
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
  const distanceUnits = isImperial ? distanceInMeters / METERS_PER_MILE : distanceInMeters / METERS_PER_KM;
  const perDistanceRate = isImperial ? perMileInSubunits : perKmInSubunits;
  const clampedSurge = Math.max(1, surgeMultiplier);

  const distanceFareRaw = distanceUnits * perDistanceRate * clampedSurge;
  const timeFareRaw = (durationInSeconds / 60) * perMinuteInSubunits * clampedSurge;

  const subtotal = baseFareInSubunits + distanceFareRaw + timeFareRaw + serviceFeeInSubunits;
  const roundedSubtotal = Math.round(subtotal);
  const total = Math.max(roundedSubtotal, minimumFareInSubunits);

  return {
    currency,
    baseFareInSubunits: Math.round(baseFareInSubunits),
    distanceFareInSubunits: Math.round(distanceFareRaw),
    timeFareInSubunits: Math.round(timeFareRaw),
    serviceFeeInSubunits: Math.round(serviceFeeInSubunits),
    totalInSubunits: total,
    distanceInMeters,
    durationInSeconds,
    surgeMultiplier: clampedSurge,
    appliedMinimumFare: total > roundedSubtotal,
  };
};

const MILES_PER_METER = 1 / METERS_PER_MILE;
const MINUTES_PER_SECOND = 1 / 60;

module.exports = {
  DEFAULT_RIDE_PRICING,
  calculateRideFare,
  METERS_PER_MILE,
  METERS_PER_KM,
  MILES_PER_METER,
  MINUTES_PER_SECOND,
};
