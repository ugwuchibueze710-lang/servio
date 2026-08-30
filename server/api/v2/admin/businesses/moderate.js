/**
 * server/api/v2/admin/businesses/moderate.js
 *
 * PATCH /api/v2/admin/businesses/:id - toggle a provider's active (visible in search) and/or
 * verified status. Deactivating here is what removes a business from
 * GET /api/v2/search/providers immediately, without deleting their history of past bookings.
 */
const Business = require('../../../../models/Business');
const { isConnected, connect } = require('../../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { active, verified } = req.body || {};

  if (active === undefined && verified === undefined) {
    res.status(400).json({ error: 'nothing_to_update', message: 'Provide active and/or verified.' });
    return;
  }

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
    const business = await Business.findById(id);
    if (!business) {
      res.status(404).json({ error: 'business_not_found', message: 'This business could not be found.' });
      return;
    }
    if (typeof active === 'boolean') business.active = active;
    if (typeof verified === 'boolean') business.verified = verified;
    await business.save();

    res.status(200).json({ business });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/businesses moderate] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
