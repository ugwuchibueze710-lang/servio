/**
 * server/api/v2/reviews/createBookingReview.js
 *
 * POST /api/v2/reviews/bookings/:id - a customer reviewing the business after a completed
 * booking. Spec section 20's "reviews tied only to completed transactions" is enforced here, not
 * trusted from the client: the booking must belong to this customer AND actually be 'completed',
 * and each booking can only be reviewed once (no review-spam inflating a business's rating). The
 * business's ratingAvg/ratingCount are recomputed from the real set of reviews after every write
 * - never incremented by hand - so they can't drift out of sync with what's actually in the
 * database.
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const Review = require('../../../models/Review');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body || {};

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    res.status(400).json({ error: 'invalid_rating', message: 'rating must be an integer from 1 to 5.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'review_database_unavailable',
      message: 'Reviews are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ error: 'booking_not_found', message: 'This booking could not be found.' });
      return;
    }
    if (String(booking.customer) !== String(req.appUser._id)) {
      res.status(403).json({ error: 'not_authorized', message: 'This is not your booking.' });
      return;
    }
    if (!['confirmed', 'paid_out'].includes(booking.status)) {
      res.status(409).json({
        error: 'not_completed',
        message: 'You can only review a booking after you have confirmed the job was completed.',
      });
      return;
    }

    const existing = await Review.findOne({ booking: booking._id, author: req.appUser._id });
    if (existing) {
      res.status(409).json({ error: 'already_reviewed', message: 'You already reviewed this booking.' });
      return;
    }

    await Review.create({
      booking: booking._id,
      author: req.appUser._id,
      subjectType: 'business',
      subjectBusiness: booking.business,
      rating: ratingNum,
      comment: typeof comment === 'string' ? comment.trim().slice(0, 1000) : undefined,
    });

    const stats = await Review.aggregate([
      { $match: { subjectBusiness: booking.business } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const business = await Business.findById(booking.business);
    if (business) {
      business.ratingAvg = stats[0] ? Math.round(stats[0].avg * 10) / 10 : 0;
      business.ratingCount = stats[0] ? stats[0].count : 0;
      await business.save();
    }

    res.status(201).json({
      review: { rating: ratingNum, comment },
      business: business ? { ratingAvg: business.ratingAvg, ratingCount: business.ratingCount } : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/reviews createBookingReview] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
