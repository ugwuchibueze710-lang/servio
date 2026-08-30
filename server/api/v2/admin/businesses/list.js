/**
 * server/api/v2/admin/businesses/list.js
 *
 * GET /api/v2/admin/businesses?q= - every provider profile, including inactive ones, for admin
 * moderation. The public search (GET /api/v2/search/providers) only ever shows active:true.
 */
const Business = require('../../../../models/Business');
const { isConnected, connect } = require('../../../../db/mongoose');

module.exports = async (req, res) => {
  const { q } = req.query || {};

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'provider_database_unavailable',
      message: 'Provider profiles are not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  try {
    const filter = {};
    if (typeof q === 'string' && q.trim()) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = new RegExp(escaped, 'i');
    }
    const businesses = await Business.find(filter)
      .sort({ createdAt: -1 })
      .populate('categories', 'name slug')
      .populate('owner', 'firstName lastName email')
      .lean();
    res.status(200).json({ data: businesses });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/businesses list] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
