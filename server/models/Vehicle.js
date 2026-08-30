/**
 * Vehicle - a driver's registered vehicle (section 12). Split out from Driver so a driver could
 * in principle register more than one vehicle later without a schema change.
 */
const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true, index: true },
    type: { type: String, trim: true, maxlength: 60 },
    make: { type: String, required: true, trim: true, maxlength: 60 },
    model: { type: String, required: true, trim: true, maxlength: 60 },
    year: { type: Number, min: 1980, max: new Date().getFullYear() + 1 },
    color: { type: String, trim: true, maxlength: 40 },
    licensePlate: { type: String, required: true, trim: true, maxlength: 20 },
    photoUrl: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);
