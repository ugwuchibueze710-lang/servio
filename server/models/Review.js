/**
 * Review - tied to one real completed Booking or RideRequest (section 20). Never freestanding -
 * a review always references the transaction it came from, and the API layer (phase 4/13) must
 * verify that transaction actually reached a completed state before allowing the review to be
 * created, so there is no path to an arbitrary/fake review.
 */
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', index: true },
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'RideRequest', index: true },

    author: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
    subjectType: { type: String, enum: ['business', 'appUser'], required: true },
    subjectBusiness: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
    subjectUser: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser' },

    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

reviewSchema.index({ subjectBusiness: 1, createdAt: -1 });
reviewSchema.index({ subjectUser: 1, createdAt: -1 });

module.exports = mongoose.models.Review || mongoose.model('Review', reviewSchema);
