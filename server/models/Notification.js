/**
 * Notification - real in-app notifications (spec section 40). Created by the API layer on
 * actual events (new request, accepted, declined, message, quote, payment, payout, review,
 * dispute, cancellation) - never a static/fake list. Architecture leaves room for push/email
 * fan-out later without the core app depending on it.
 */
const mongoose = require('mongoose');

const NOTIFICATION_TYPE_VALUES = [
  'new_request',
  'request_accepted',
  'request_declined',
  'new_message',
  'quote_received',
  'quote_accepted',
  'quote_declined',
  'job_scheduled',
  'job_completed',
  'confirmation_needed',
  'payment_received',
  'payout_released',
  'review_received',
  'review_request',
  'dispute_opened',
  'dispute_resolved',
  'cancellation',
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPE_VALUES, required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, trim: true, maxlength: 500 },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPE_VALUES = NOTIFICATION_TYPE_VALUES;
