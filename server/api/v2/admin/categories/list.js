/**
 * server/api/v2/admin/categories/list.js
 *
 * GET /api/v2/admin/categories - every category, including inactive ones (unlike the public
 * GET /api/v2/categories, which only shows active:true) - an admin needs to see what's hidden
 * too, to be able to re-activate it.
 */
const Category = require('../../../../models/Category');
const { isConnected, connect } = require('../../../../db/mongoose');

module.exports = async (req, res) => {
  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'category_database_unavailable',
      message: 'The category database is not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  try {
    const categories = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    res.status(200).json({ data: categories });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/categories list] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
