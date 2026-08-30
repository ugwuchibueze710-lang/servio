/**
 * server/api/v2/admin/categories/update.js
 *
 * PATCH /api/v2/admin/categories/:id - edit an existing category's display fields. Slug is
 * intentionally NOT editable here (it's baked into every Business/Booking that reference the
 * category by slug via other lookups, and into any bookmarked/shared links) - create a new
 * category and deactivate the old one if the slug itself needs to change.
 */
const Category = require('../../../../models/Category');
const { isConnected, connect } = require('../../../../db/mongoose');

const EDITABLE_FIELDS = ['name', 'blurb', 'imageUrl', 'isRideCategory', 'sortOrder', 'active'];

module.exports = async (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'category_database_unavailable',
      message: 'The category database is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const category = await Category.findById(id);
    if (!category) {
      res.status(404).json({ error: 'category_not_found', message: 'This category could not be found.' });
      return;
    }

    for (const field of EDITABLE_FIELDS) {
      if (updates[field] === undefined) continue;
      if (field === 'name' || field === 'blurb' || field === 'imageUrl') {
        category[field] = String(updates[field]).trim();
      } else if (field === 'isRideCategory' || field === 'active') {
        category[field] = !!updates[field];
      } else if (field === 'sortOrder') {
        const n = Number(updates[field]);
        if (Number.isFinite(n)) category.sortOrder = n;
      }
    }
    await category.save();

    res.status(200).json({ category });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/categories update] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
