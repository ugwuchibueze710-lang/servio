/**
 * Business - a service provider's real profile (section 4 & 5 of the migration spec).
 *
 * A provider can offer more than one category (e.g. Cleaning + Deep Cleaning), so `categories`
 * is an array of Category references rather than a single field. Geospatial `location` uses
 * GeoJSON Point + a 2dsphere index so customer search can do real proximity queries instead of
 * string-matching city names.
 */
const mongoose = require('mongoose');

const portfolioImageSchema = new mongoose.Schema(
  { url: { type: String, required: true }, caption: { type: String, trim: true, maxlength: 200 } },
  { _id: false }
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

    serviceAreaLabel: { type: String, trim: true, maxlength: 160 },
    serviceRadiusMiles: { type: Number, default: 15, min: 1, max: 200 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },

    pricingNote: { type: String, trim: true, maxlength: 300 },
    availabilityNote: { type: String, trim: true, maxlength: 300 },
    contactPhone: { type: String, trim: true, maxlength: 40 },

    verified: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },

    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

businessSchema.index({ location: '2dsphere' });
businessSchema.index({ categories: 1, active: 1, ratingAvg: -1 });
businessSchema.index({ name: 'text', bio: 'text' });

module.exports = mongoose.models.Business || mongoose.model('Business', businessSchema);
