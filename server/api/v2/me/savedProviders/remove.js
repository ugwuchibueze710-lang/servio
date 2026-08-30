/**
 * server/api/v2/me/savedProviders/remove.js
 *
 * DELETE /api/v2/me/saved-providers/:businessId - un-favorite a provider. Idempotent: removing
 * something that isn't saved is a harmless no-op, not an error.
 */
module.exports = async (req, res) => {
  const { businessId } = req.params;

  try {
    req.appUser.savedProviders = req.appUser.savedProviders.filter(
      id => String(id) !== String(businessId)
    );
    await req.appUser.save();
    res.status(200).json({ savedProviders: req.appUser.savedProviders });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/me/savedProviders remove] failed:', err.message);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
