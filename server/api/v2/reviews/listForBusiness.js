/**
 * server/api/v2/reviews/listForBusiness.js
 *
 * GET /api/v2/reviews/business/:businessId - public, real reviews for a business, newest first.
 * A business with no reviews yet gets a real empty array, not fake testimonials.
 */
const Review = require('../../../models/Review');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { businessId } = req.params;

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'review_database_unavailable',
      message: 'Reviews are not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  try {
    const reviews = await Review.find({ subjectBusiness: businessId })
      .sort({ createdAt: -1 })
      .populate('author', 'firstName lastName profileImageUrl')
      .lean();
    res.status(200).json({ data: reviews });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/reviews listForBusiness] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
