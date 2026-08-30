/**
 * server/api/v2/providers/setAcceptingJobs.js
 *
 * PATCH /api/v2/providers/me/accepting-jobs - a lightweight, dedicated toggle for the
 * "Accepting New Jobs" switch (spec section 28: a REAL gate, not just a display label - see
 * server/utils/providerSearch.js and server/api/v2/bookings/create.js, both of which already
 * enforce it). Deliberately separate from the full POST /api/v2/providers/me upsert, which
 * requires re-sending the entire profile (name/bio/categories) on every call - a provider
 * flipping this switch from their dashboard shouldn't have to resubmit their whole profile just
 * to do it.
 */
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { acceptingNewJobs } = req.body || {};

  if (typeof acceptingNewJobs !== 'boolean') {
    res.status(400).json({ error: 'invalid_value', message: 'acceptingNewJobs must be true or false.' });
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
    const business = await Business.findOne({ owner: req.appUser._id });
    if (!business) {
      res.status(404).json({
        error: 'no_provider_profile',
        message: 'Create a provider profile before changing this setting.',
      });
      return;
    }
    business.acceptingNewJobs = acceptingNewJobs;
    await business.save();
    res.status(200).json({ business });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/providers setAcceptingJobs] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
