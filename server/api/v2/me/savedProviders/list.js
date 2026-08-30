/**
 * server/api/v2/me/savedProviders/list.js
 *
 * GET /api/v2/me/saved-providers - the customer's real favorited providers, populated with
 * enough live business data (rating, accepting-new-jobs state, etc) to render a dashboard list
 * without a second round of requests per card.
 */
const AppUser = require('../../../../models/AppUser');

module.exports = async (req, res) => {
  try {
    const user = await AppUser.findById(req.appUser._id).populate({
      path: 'savedProviders',
      select: 'name slug bio profileImageUrl ratingAvg ratingCount acceptingNewJobs serviceAreaLabel categories',
      populate: { path: 'categories', select: 'name slug' },
    });
    res.status(200).json({ data: user.savedProviders });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/me/savedProviders list] failed:', err.message);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
