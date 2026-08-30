/**
 * AppUser - the new, custom-backend account record.
 *
 * Deliberately named AppUser (not "User") and kept in its own collection so it can never be
 * confused with a Sharetribe user record while both systems exist side by side during the
 * migration. One account can hold multiple capabilities at once (customer/provider/driver) per
 * spec section 18 - there is no separate signup flow per role.
 */
const mongoose = require('mongoose');

const ROLE_VALUES = ['customer', 'provider', 'driver'];

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
    notificationsEnabled: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
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
