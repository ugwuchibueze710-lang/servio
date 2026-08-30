/**
 * Booking - a real service request/booking between a customer and a Business (section 6 & 7).
 *
 * This is what powers the provider's inbox and the customer's "Requested -> Accepted ->
 * Scheduled -> In progress -> Completed" status tracking. Every request a customer sends is one
 * of these documents - there is no "fake" in-memory-only request state.
 */
const mongoose = require('mongoose');

const STATUS_VALUES = [
  'requested',
  'accepted',
  'declined',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
];

const photoSchema = new mongoose.Schema({ url: { type: String, required: true } }, { _id: false });

const bookingSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },

    description: { type: String, required: true, maxlength: 2000 },
    photos: { type: [photoSchema], default: [] },

    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: undefined },
    },
    locationLabel: { type: String, trim: true, maxlength: 200 },

    requestedDate: { type: Date },
    requestedTimeNote: { type: String, trim: true, maxlength: 120 },
    budgetNote: { type: String, trim: true, maxlength: 200 },
    additionalNotes: { type: String, trim: true, maxlength: 1000 },

    status: { type: String, enum: STATUS_VALUES, default: 'requested', index: true },
    quotedPrice: { type: Number, min: 0 },

    stripePaymentIntentId: { type: String },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'processing', 'paid', 'failed', 'refunded'],
      default: 'unpaid',
    },

    completedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true }
);

bookingSchema.index({ business: 1, status: 1, createdAt: -1 });
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ location: '2dsphere' });

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
module.exports.STATUS_VALUES = STATUS_VALUES;
