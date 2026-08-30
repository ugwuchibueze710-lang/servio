/**
 * AppUser - the custom-backend account record. One account, multiple capabilities
 * (customer/provider/driver) - never a separate signup flow per role (spec section 1/2/4).
 *
 * Extended with:
 *  - `savedProviders`: real favorites list (spec section 38).
 *  - `searchHistory`: real per-user query log powering search-box suggestions (Groq smart
 *    search, spec addendum) - capped and most-recent-first.
 *  - `locationPref`: the customer's locked/unlocked location + radius, persisted so it
 *    survives a reload instead of living only in frontend state.
 */
const mongoose = require('mongoose');

const ROLE_VALUES = ['customer', 'provider', 'driver'];

const searchHistoryEntrySchema = new mongoose.Schema(
  { query: { type: String, required: true, trim: true, maxlength: 200 }, searchedAt: { type: Date, default: Date.now } },
  { _id: false }
);

const locationPrefSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 200 },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
    radiusMiles: { type: Number, default: 15, min: 1, max: 200 },
    locked: { type: Boolean, default: false },
  },
  { _id: false }
);

const appUserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 40 },
    profileImageUrl: { type: String, default: '' },
    roles: {
      type: [{ type: String, enum: ROLE_VALUES }],
      default: ['customer'],
    },
    // Which mode the account is currently operating in (spec section 1: only one at a time).
    activeMode: { type: String, enum: ['customer', 'provider'], default: 'customer' },

    savedProviders: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Business' }],
      default: [],
    },
    searchHistory: { type: [searchHistoryEntrySchema], default: [] },
    locationPref: { type: locationPrefSchema, default: () => ({}) },

    notificationsEnabled: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    sharetribeUserId: { type: String, index: true, sparse: true },
    isAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

appUserSchema.methods.toSafeJSON = function toSafeJSON() {
  const obj = this.toObject({ versionKey: false });
  delete obj.passwordHash;
  return obj;
};

module.exports = mongoose.models.AppUser || mongoose.model('AppUser', appUserSchema);
module.exports.ROLE_VALUES = ROLE_VALUES;
