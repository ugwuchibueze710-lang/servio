/**
 * Driver - the ride-hailing capability record for an AppUser (section 12).
 *
 * Kept separate from AppUser (rather than cramming ride fields onto the account) so the
 * "customer + provider + driver on one account" model in section 18 stays clean: an AppUser
 * gains a Driver document only once they complete driver onboarding, the same way they gain a
 * Business document once they complete provider onboarding.
 *
 * `isOnline` + `currentLocation` are exactly what ride matching (phase 5) queries against - only
 * online drivers with a recent location are eligible to be matched, per spec section 12/13.
 */
const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser', required: true, unique: true, index: true },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    licenseVerified: { type: Boolean, default: false },

    isOnline: { type: Boolean, default: false, index: true },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    locationUpdatedAt: { type: Date },

    operatingAreaLabel: { type: String, trim: true, maxlength: 160 },

    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

driverSchema.index({ currentLocation: '2dsphere' });
driverSchema.index({ isOnline: 1, active: 1 });

module.exports = mongoose.models.Driver || mongoose.model('Driver', driverSchema);
