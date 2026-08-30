/**
 * server/api/v2/categories.js
 *
 * GET /api/v2/categories - public, returns every active category sorted for display. This is the
 * first real endpoint of the new custom backend (see server/models/README.md) and is what the
 * homepage's CategoryHero component now fetches from instead of importing the static
 * src/config/configServiceCategories.js array.
 */
const { isConnected, connect } = require('../../db/mongoose');
const Category = require('../../models/Category');

module.exports = async (req, res) => {
  if (!isConnected()) {
    // Try to connect on-demand (covers the case where MONGODB_URI was just added and the process
    // hasn't reconnected yet) rather than requiring a manual restart.
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'category_database_unavailable',
      message:
        'The category database is not configured yet (MONGODB_URI is unset or unreachable). ' +
        'The homepage falls back to its bundled category list until this is fixed.',
    });
    return;
  }

  try {
    const categories = await Category.find({ active: true })
      .sort({ sortOrder: 1, name: 1 })
      .select('name slug blurb imageUrl isRideCategory sortOrder')
      .lean();
    res.status(200).json({ data: categories });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/categories] query failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
