/**
 * server/api/v2/me/savedProviders/add.js
 *
 * POST /api/v2/me/saved-providers/:businessId - a real "save/favorite this provider" (spec
 * section 21 / customer dashboard). Verifies the business actually exists before saving a
 * dangling reference, and is idempotent (saving twice is a no-op, not a duplicate entry).
 */
const Business = require('../../../../models/Business');

module.exports = async (req, res) => {
  const { businessId } = req.params;

  try {
    const business = await Business.findById(businessId).select('_id');
    if (!business) {
      res.status(404).json({ error: 'business_not_found', message: 'This provider could not be found.' });
      return;
    }

    const already = req.appUser.savedProviders.some(id => String(id) === String(business._id));
    if (!already) {
      req.appUser.savedProviders.push(business._id);
      await req.appUser.save();
    }

    res.status(200).json({ savedProviders: req.appUser.savedProviders });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/me/savedProviders add] failed:', err.message);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
