/**
 * server/api/v2/providers/getMe.js
 *
 * GET /api/v2/providers/me - the authenticated user's own Business (provider) profile, or
 * `business: null` if they haven't created one yet (a genuine "no profile yet" state, not an
 * error and not fake placeholder data).
 */
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
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
    const business = await Business.findOne({ owner: req.appUser._id }).populate('categories', 'name slug');
    res.status(200).json({ business: business || null });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/providers/me GET] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
