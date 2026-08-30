/**
 * Business - a service provider's real profile.
 *
 * Extended for the full local-services marketplace spec:
 *  - `services`: structured per-category pricing (fixed / range / hourly / request-quote),
 *    replacing the old freeform pricingNote as the source of truth for what customers see on
 *    listings. pricingNote is kept (legacy, optional) so nothing that reads it breaks.
 *  - `acceptingNewJobs`: a REAL boolean gate. Search must exclude businesses where this is
 *    false - it is not just a display label (spec section 28).
 *  - `profileViewCount` / `responseStats`: real counters updated by the API layer (profile
 *    view endpoint, booking respond endpoint) so dashboard metrics are computed from actual
 *    data, never hardcoded.
 *  - `stripeConnectAccountId` / `stripeConnectPayoutsEnabled`: Stripe Connect Express account
 *    for this provider. Payouts only happen once this is set and enabled.
 */
const mongoose = require('mongoose');

const PRICING_TYPE_VALUES = ['fixed', 'starting_at', 'range', 'hourly', 'per_unit', 'request_quote'];

const portfolioImageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, caption: { type: String, trim: true, maxlength: 200 } },
  { _id: false }
);

const serviceSchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 600 },
    pricingType: { type: String, enum: PRICING_TYPE_VALUES, required: true },
    fixedPrice: { type: Number, min: 0 },
    priceMin: { type: Number, min: 0 },
    priceMax: { type: Number, min: 0 },
    hourlyRate: { type: Number, min: 0 },
    unitLabel: { type: String, trim: true, maxlength: 40 },
    active: { type: Boolean, default: true },
  },
  { _id: true }
);

const businessSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, trim: true, unique: true, lowercase: true, index: true },
    bio: { type: String, required: true, maxlength: 2000 },
    profileImageUrl: { type: String, default: '' },
    portfolioImages: { type: [portfolioImageSchema], default: [] },

    categories: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      required: true,
      validate: v => Array.isArray(v) && v.length > 0,
    },
    services: { type: [serviceSchema], default: [] },

    serviceAreaLabel: { type: String, trim: true, maxlength: 160 },
    serviceRadiusMiles: { type: Number, default: 15, min: 1, max: 200 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },

    // Legacy freeform fields - kept so any existing reader keeps working; `services` above is
    // the real source of truth for pricing going forward.
    pricingNote: { type: String, trim: true, maxlength: 300 },
    availabilityNote: { type: String, trim: true, maxlength: 300 },

    acceptingNewJobs: { type: Boolean, default: true, index: true },
    contactPhone: { type: String, trim: true, maxlength: 40 },
    publishPhone: { type: Boolean, default: false },

    verified: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },

    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },

    // Real, server-incremented metrics (spec sections 26/27) - never hardcoded on the client.
    profileViewCount: { type: Number, default: 0, min: 0 },
    requestsReceivedCount: { type: Number, default: 0, min: 0 },
    requestsRespondedCount: { type: Number, default: 0, min: 0 },
    totalResponseTimeMs: { type: Number, default: 0, min: 0 },
    completedJobsCount: { type: Number, default: 0, min: 0 },
    cancelledJobsCount: { type: Number, default: 0, min: 0 },

    stripeConnectAccountId: { type: String },
    stripeConnectPayoutsEnabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

businessSchema.index({ location: '2dsphere' });
businessSchema.index({ categories: 1, active: 1, acceptingNewJobs: 1, ratingAvg: -1 });
businessSchema.index({ name: 'text', bio: 'text' });

// Real, computed-from-data metrics - never store these as a lie.
businessSchema.methods.responseRate = function responseRate() {
  return this.requestsReceivedCount > 0
    ? this.requestsRespondedCount / this.requestsReceivedCount
    : null;
};
businessSchema.methods.avgResponseTimeMs = function avgResponseTimeMs() {
  return this.requestsRespondedCount > 0
    ? this.totalResponseTimeMs / this.requestsRespondedCount
    : null;
};

module.exports = mongoose.models.Business || mongoose.model('Business', businessSchema);
module.exports.PRICING_TYPE_VALUES = PRICING_TYPE_VALUES;
