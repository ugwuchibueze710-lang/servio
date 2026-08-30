/**
 * Category - the real, database-driven service category list.
 *
 * This replaces src/config/configServiceCategories.js as the source of truth. That file was a
 * static array hardcoded into the frontend bundle; this collection is what actually powers the
 * homepage category grid, provider category selection, and category-based search, and can be
 * edited by an admin without a code deploy (an admin CRUD UI is a later phase - for now, use
 * server/scripts/seedCategories.js to seed/update it).
 */
const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true, maxlength: 80 },
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
      maxlength: 80,
      index: true,
    },
    blurb: { type: String, trim: true, maxlength: 240, default: '' },
    imageUrl: { type: String, required: true },
    isRideCategory: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

categorySchema.index({ active: 1, sortOrder: 1 });
categorySchema.index({ name: 'text', blurb: 'text' });

module.exports = mongoose.models.Category || mongoose.model('Category', categorySchema);
