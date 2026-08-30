/**
 * RideRequest - one real ride, from request through completion (section 13/14).
 *
 * The status enum below is the actual backend state machine spec section 13 asks for - the
 * frontend must never just flip a local variable to "driver assigned"; it has to come from a
 * transition on this document (phase 5 will add the matching engine + Socket.IO events that
 * drive these transitions).
 */
const mongoose = require('mongoose');

const STATUS_VALUES = [
  'requested',
  'searching',
  'driver_assigned',
  'driver_arriving',
  'driver_arrived',
  'trip_started',
  'trip_completed',
  'cancelled',
  'no_drivers_found',
];

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
    label: { type: String, trim: true, maxlength: 200 },
  },
  { _id: false }
);

const rideRequestSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', index: true },

    pickup: { type: pointSchema, required: true },
    destination: { type: pointSchema, required: true },

    estimatedDistanceMiles: { type: Number, min: 0 },
    estimatedDurationMinutes: { type: Number, min: 0 },
    estimatedFare: { type: Number, min: 0 },
    finalFare: { type: Number, min: 0 },
    // Recorded only at trip_completed, from the driver's actual GPS-accumulated distance/
    // duration (see server/api/v2/rides/updateStatus.js) - deliberately separate from the
    // estimatedDistanceMiles/estimatedDurationMinutes above, which come from the pre-trip route
    // estimate and are never overwritten, so the two can always be compared.
    actualDistanceMiles: { type: Number, min: 0 },
    actualDurationMinutes: { type: Number, min: 0 },

    status: { type: String, enum: STATUS_VALUES, default: 'requested', index: true },

    candidateDrivers: [
      {
        driver: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
        notifiedAt: { type: Date, default: Date.now },
        response: { type: String, enum: ['pending', 'accepted', 'declined', 'timed_out'], default: 'pending' },
        respondedAt: { type: Date },
      },
    ],

    stripePaymentIntentId: { type: String },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'processing', 'paid', 'failed', 'refunded'],
      default: 'unpaid',
    },

    requestedAt: { type: Date, default: Date.now },
    driverAssignedAt: { type: Date },
    tripStartedAt: { type: Date },
    tripCompletedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

rideRequestSchema.index({ 'pickup.coordinates': '2dsphere' });
rideRequestSchema.index({ customer: 1, createdAt: -1 });
rideRequestSchema.index({ driver: 1, status: 1 });

module.exports = mongoose.models.RideRequest || mongoose.model('RideRequest', rideRequestSchema);
module.exports.STATUS_VALUES = STATUS_VALUES;
