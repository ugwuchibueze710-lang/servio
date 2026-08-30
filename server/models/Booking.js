/**
 * Booking - a real service request/job between a customer and a Business. This IS the
 * "Project Passport": one persistent document holding the request, quote, schedule, job
 * status, payment/payout status, completion evidence, and dispute state, so nobody has to dig
 * through chat history to reconstruct what was agreed (spec section 51, differentiator #2).
 *
 * STATUS_VALUES now covers the full lifecycle from the spec:
 *   requested -> accepted -> scheduled -> in_progress -> completed_pending_confirmation
 *     -> confirmed -> paid_out
 *   (or) declined / cancelled / disputed
 */
const mongoose = require('mongoose');

const STATUS_VALUES = [
  'requested',
  'accepted',
  'declined',
  'scheduled',
  'in_progress',
  'completed_pending_confirmation',
  'confirmed',
  'paid_out',
  'disputed',
  'cancelled',
];

const QUOTE_STATUS_VALUES = ['none', 'requested', 'sent', 'accepted', 'declined'];
const DISPUTE_STATUS_VALUES = [
  'none',
  'under_review',
  'resolved_customer',
  'resolved_provider',
  'refunded',
  'partially_refunded',
];

const photoSchema = new mongoose.Schema({ url: { type: String, required: true } }, { _id: false });

const quoteSchema = new mongoose.Schema(
  {
    status: { type: String, enum: QUOTE_STATUS_VALUES, default: 'none' },
    amount: { type: Number, min: 0 },
    description: { type: String, trim: true, maxlength: 1000 },
    estimatedCompletionDate: { type: Date },
    sentAt: { type: Date },
    respondedAt: { type: Date },
  },
  { _id: false }
);

const disputeSchema = new mongoose.Schema(
  {
    status: { type: String, enum: DISPUTE_STATUS_VALUES, default: 'none' },
    reason: { type: String, trim: true, maxlength: 1000 },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser' },
    reportedAt: { type: Date },
    providerResponse: { type: String, trim: true, maxlength: 1000 },
    resolutionNote: { type: String, trim: true, maxlength: 1000 },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser' },
  },
  { _id: false }
);

const cancellationFeeSchema = new mongoose.Schema(
  {
    // Real, configurable policy (spec section 35) - see server/utils/cancellationPolicy.js for
    // the actual computation. Populated only when a late customer cancellation triggers a fee;
    // absent (amount 0) for free cancellations (provider-cancelled, or well before the job date).
    amount: { type: Number, min: 0, default: 0 },
    refundAmount: { type: Number, min: 0 },
    feePercent: { type: Number, min: 0, max: 100 },
    windowHours: { type: Number, min: 0 },
    reason: { type: String, trim: true, maxlength: 200 },
    stripeRefundId: { type: String },
    providerCompensationTransferId: { type: String },
    compensationReleased: { type: Boolean, default: false },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    service: { type: mongoose.Schema.Types.ObjectId },

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
    quote: { type: quoteSchema, default: () => ({}) },

    stripePaymentIntentId: { type: String },
    stripeTransferId: { type: String },
    platformFeeAmount: { type: Number, min: 0 },
    providerPayoutAmount: { type: Number, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'processing', 'paid', 'failed', 'refunded', 'paid_out'],
      default: 'unpaid',
    },

    respondedAt: { type: Date },
    completionEvidencePhotos: { type: [photoSchema], default: [] },
    completedAt: { type: Date },
    confirmationDeadline: { type: Date },
    confirmedAt: { type: Date },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true, maxlength: 300 },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser' },

    dispute: { type: disputeSchema, default: () => ({}) },
    cancellationFee: { type: cancellationFeeSchema, default: undefined },
  },
  { timestamps: true }
);

bookingSchema.index({ business: 1, status: 1, createdAt: -1 });
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ location: '2dsphere' });
bookingSchema.index({ 'dispute.status': 1 });

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
module.exports.STATUS_VALUES = STATUS_VALUES;
module.exports.QUOTE_STATUS_VALUES = QUOTE_STATUS_VALUES;
module.exports.DISPUTE_STATUS_VALUES = DISPUTE_STATUS_VALUES;
