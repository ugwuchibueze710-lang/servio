/**
 * server/api/v2/admin/categories/deactivate.js
 *
 * DELETE /api/v2/admin/categories/:id - a soft delete (active: false), not a hard row delete.
 * Businesses and past Bookings/RideRequests reference categories by ObjectId - hard-deleting one
 * would leave dangling references and break history for anything already tied to it. Setting
 * `active: false` removes it from the public list (GET /api/v2/categories only returns
 * active:true) while keeping referential integrity intact; it can be reactivated via PATCH.
 */
const Category = require('../../../../models/Category');
const { isConnected, connect } = require('../../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;

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
    category.active = false;
    await category.save();
    res.status(200).json({ category });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/categories deactivate] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
