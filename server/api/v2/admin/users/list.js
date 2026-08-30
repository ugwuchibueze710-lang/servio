/**
 * server/api/v2/admin/users/list.js
 *
 * GET /api/v2/admin/users?q=&page=&limit= - real account search/listing for admin oversight.
 * Never returns passwordHash (AppUser's schema already excludes it by default via `select:
 * false`). Empty results for a query that matches nobody, not an error.
 */
const AppUser = require('../../../../models/AppUser');
const { isConnected, connect } = require('../../../../db/mongoose');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

module.exports = async (req, res) => {
  const { q, page, limit } = req.query || {};

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'account_database_unavailable',
      message: 'The account database is not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));

  try {
    const filter = {};
    if (typeof q === 'string' && q.trim()) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.email = new RegExp(escaped, 'i');
    }

    const [users, total] = await Promise.all([
      AppUser.find(filter)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      AppUser.countDocuments(filter),
    ]);

    res.status(200).json({ data: users, page: pageNum, limit: limitNum, total });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/users list] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
