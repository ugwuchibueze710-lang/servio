const { types } = require('sharetribe-flex-sdk');
const { Money } = types;
const {
  getProviderCommissionMaybe,
  getCustomerCommissionMaybe,
} = require('./lineItemHelpers');

/////////////////////////////////////////////////////////////////////////////
// Server-side ride fare calculation.                                      //
//                                                                         //
// IMPORTANT - kept deliberately independent from                         //
// src/config/configRidePricing.js rather than importing it: this repo's  //
// client bundle (webpack/CRA) and its Node server (plain `require`,      //
// started directly with `node`/`nodemon` in dev - see "dev-backend" in   //
// package.json) do not share a module system, so an ES-module `src/`     //
// file cannot be safely `require`-d here. The calculation logic below    //
// MUST be kept numerically identical to `calculateRideFare` in           //
// src/config/configRidePricing.js - that file shows a live estimate,     //
// this one computes the actual charge, and the two must never silently   //
// diverge. A Phase 5 hardening task should extract this into a small     //
// shared package both sides can consume instead of hand-keeping parity.  //
/////////////////////////////////////////////////////////////////////////////

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

// Same Console asset pattern as `fetchCommission` in `server/api-util/sdk.js`.
const fetchRidePricing = sdk => {
  return sdk
    .assetsByAlias({ paths: ['ride/ride-pricing.json'], alias: 'latest' })
    .then(response => {
      const asset = response?.data?.data?.[0];
      const remoteConfig = asset?.attributes?.data;
      return remoteConfig ? { ...DEFAULT_RIDE_PRICING, ...remoteConfig } : DEFAULT_RIDE_PRICING;
    })
    .catch(() => DEFAULT_RIDE_PRICING);
};

const calculateRideFare = ({ distanceInMeters, durationInSeconds }, pricing = DEFAULT_RIDE_PRICING) => {
  if (!(distanceInMeters >= 0) || !(durationInSeconds >= 0)) {
    const error = new Error(
      'calculateRideFare requires a real, non-negative distanceInMeters/durationInSeconds from Mapbox Directions.'
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

/**
 * Build the Sharetribe line-items array for a ride, reusing Servio's
 * existing commission line-item helpers exactly as every other process
 * does (see `transactionLineItems` in `server/api-util/lineItems.js`) so
 * Ride commission comes from the same Console-managed commission asset,
 * not a parallel one (spec section 13).
 */
const rideLineItems = (fareBreakdown, providerCommission, customerCommission) => {
  const { currency, totalInSubunits } = fareBreakdown;

  const order = {
    code: 'line-item/ride-fare',
    unitPrice: new Money(totalInSubunits, currency),
    quantity: 1,
    includeFor: ['customer', 'provider'],
  };

  return [
    order,
    ...getProviderCommissionMaybe(providerCommission, order, currency),
    ...getCustomerCommissionMaybe(customerCommission, order, currency),
  ];
};

/** Line items for a fee-bearing cancellation - just the cancellation fee, nothing else. */
const cancellationLineItems = (pricing, providerCommission, customerCommission) => {
  const currency = pricing?.currency || DEFAULT_RIDE_PRICING.currency;
  const feeInSubunits = pricing?.cancellationFeeInSubunits ?? DEFAULT_RIDE_PRICING.cancellationFeeInSubunits;

  const order = {
    code: 'line-item/ride-cancellation-fee',
    unitPrice: new Money(feeInSubunits, currency),
    quantity: 1,
    includeFor: ['customer', 'provider'],
  };

  return [
    order,
    ...getProviderCommissionMaybe(providerCommission, order, currency),
    ...getCustomerCommissionMaybe(customerCommission, order, currency),
  ];
};

module.exports = {
  DEFAULT_RIDE_PRICING,
  fetchRidePricing,
  calculateRideFare,
  rideLineItems,
  cancellationLineItems,
};
