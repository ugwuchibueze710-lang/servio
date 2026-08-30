/**
 * server/api/v2/providers/getOne.js
 *
 * GET /api/v2/providers/:id - a single provider's public profile, by Business id. Public and
 * unauthenticated, same reasoning as GET /api/v2/search/providers (see that file's header) -
 * a customer browsing search results and clicking into a provider, or refreshing/deep-linking
 * directly to a "request booking" page for that provider, shouldn't need a Sharetribe session
 * just to see a public profile. Only returns active businesses - a deactivated provider is a
 * real 404, not a silently-served stale profile.
 *
 * Real, server-incremented profileViewCount (spec section 26) - counts once per request here,
 * excluding the owner viewing their own profile (via optionalAuth's req.appUser, when present)
 * so a provider checking their own listing doesn't inflate their own view metric.
 */
const mongoose = require('mongoose');
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: 'business_not_found', message: 'This business could not be found.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'provider_database_unavailable',
      message: 'Provider profiles are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const business = await Business.findById(id).populate('categories', 'name slug');
    if (!business || !business.active) {
      res.status(404).json({ error: 'business_not_found', message: 'This business could not be found.' });
      return;
    }

    const isOwner = req.appUser && String(business.owner) === String(req.appUser._id);
    if (!isOwner) {
      Business.updateOne({ _id: business._id }, { $inc: { profileViewCount: 1 } }).catch(() => {});
    }

    res.status(200).json({ business });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/providers getOne] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
