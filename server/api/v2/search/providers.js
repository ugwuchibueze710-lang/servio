/**
 * server/api/v2/search/providers.js
 *
 * GET /api/v2/search/providers?category=<slug>&lat=&lng=&radiusMiles=&q=<keywords> - public,
 * real geospatial provider search (spec sections 2, 3, 9, 10). Delegates the actual matching to
 * server/utils/providerSearch.js (shared with the Groq smart-search endpoint) so there is one
 * matching implementation, not two. `q` is optional free-text (e.g. "windows") matched against
 * each business's bio and its services' names/descriptions - not just the category.
 */
const { searchProviders, ProviderSearchError } = require('../../../utils/providerSearch');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { category, lat, lng, radiusMiles, q, sort } = req.query || {};

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'provider_database_unavailable',
      message: 'Provider search is not configured yet (MONGODB_URI is unset or unreachable).',
      data: [],
    });
    return;
  }

  try {
    const keywords = typeof q === 'string' && q.trim() ? q.trim().split(/\s+/).slice(0, 8) : undefined;
    const result = await searchProviders({ categorySlug: category, lat, lng, radiusMiles, keywords, sort });
    res.status(200).json({
      data: result.businesses,
      category: result.category,
      searchedNear: result.searchedNear,
      sort: result.sort,
    });
  } catch (err) {
    if (err instanceof ProviderSearchError) {
      res.status(err.status).json({ error: err.code, message: err.message, data: [] });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[api/v2/search/providers] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
