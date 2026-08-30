/**
 * server/api/v2/admin/categories/create.js
 *
 * POST /api/v2/admin/categories - this is what replaces manually editing and re-running
 * server/scripts/seedCategories.js (see MIGRATION_PLAN.md Phase 1) every time a category needs
 * to change: a real admin-facing write path onto the same `Category` collection. A duplicate
 * slug is rejected outright rather than silently overwriting the existing category.
 */
const Category = require('../../../../models/Category');
const { isConnected, connect } = require('../../../../db/mongoose');
const { slugify } = require('../../../../utils/slugify');

module.exports = async (req, res) => {
  const { name, blurb, imageUrl, isRideCategory, sortOrder, slug: requestedSlug } = req.body || {};

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedBlurb = typeof blurb === 'string' ? blurb.trim() : '';
  if (!trimmedName) {
    res.status(400).json({ error: 'invalid_name', message: 'Category name is required.' });
    return;
  }
  if (!trimmedBlurb) {
    res.status(400).json({ error: 'invalid_blurb', message: 'Category blurb is required.' });
    return;
  }

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
    const slug = typeof requestedSlug === 'string' && requestedSlug.trim() ? slugify(requestedSlug) : slugify(trimmedName);
    const existing = await Category.findOne({ slug });
    if (existing) {
      res.status(409).json({
        error: 'slug_in_use',
        message: `A category with slug '${slug}' already exists.`,
      });
      return;
    }

    const category = await Category.create({
      name: trimmedName,
      slug,
      blurb: trimmedBlurb,
      imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : '',
      isRideCategory: !!isRideCategory,
      active: true,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 999,
    });

    res.status(201).json({ category });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/categories create] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
