/**
 * server/api/v2/search/providers.js
 *
 * GET /api/v2/search/providers?category=<slug>&lat=&lng=&radiusMiles= - public, real
 * geospatial provider search (spec sections 2 & 3): only active Business documents that actually
 * reference the requested category are ever returned. An unknown category is a real 404, not a
 * silent empty result, and zero matching providers is a real, distinct empty `data: []` - never
 * fake/placeholder providers - so the frontend can show "No providers found in your area yet."
 * exactly when that's true. When lat/lng are given, results are ordered by real distance via
 * MongoDB's `$geoNear` against Business.location's 2dsphere index; without them, results fall
 * back to a rating-ordered list across all active providers in the category.
 */
const Business = require('../../../models/Business');
const Category = require('../../../models/Category');
const { isConnected, connect } = require('../../../db/mongoose');

const MILES_TO_METERS = 1609.34;
const DEFAULT_RADIUS_MILES = 25;
const MAX_RADIUS_MILES = 200;
const MAX_RESULTS = 50;

module.exports = async (req, res) => {
  const { category, lat, lng, radiusMiles } = req.query || {};

  if (!category || typeof category !== 'string') {
    res
      .status(400)
      .json({ error: 'missing_category', message: 'A category is required, e.g. ?category=cleaning.' });
    return;
  }

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
    const categoryDoc = await Category.findOne({ slug: category, active: true }).select('_id name slug');
    if (!categoryDoc) {
      res
        .status(404)
        .json({ error: 'unknown_category', message: `No such category: ${category}`, data: [] });
      return;
    }

    const hasLocation = lat !== undefined && lng !== undefined;
    let latNum;
    let lngNum;
    let radiusNum = DEFAULT_RADIUS_MILES;

    if (hasLocation) {
      latNum = Number(lat);
      lngNum = Number(lng);
      if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        res.status(400).json({ error: 'invalid_location', message: 'lat/lng must be valid coordinates.' });
        return;
      }
      const requestedRadius = Number(radiusMiles);
      if (Number.isFinite(requestedRadius) && requestedRadius > 0) {
        radiusNum = Math.min(requestedRadius, MAX_RADIUS_MILES);
      }
    }

    let businesses;
    if (hasLocation) {
      businesses = await Business.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lngNum, latNum] },
            distanceField: 'distanceMeters',
            maxDistance: radiusNum * MILES_TO_METERS,
            spherical: true,
            query: { categories: categoryDoc._id, active: true },
          },
        },
        { $limit: MAX_RESULTS },
      ]);
      // $geoNear can't populate refs inside the aggregation pipeline itself - resolve category
      // references on the plain result docs afterwards instead.
      businesses = await Business.populate(businesses, { path: 'categories', select: 'name slug' });
    } else {
      businesses = await Business.find({ categories: categoryDoc._id, active: true })
        .sort({ ratingAvg: -1, createdAt: -1 })
        .limit(MAX_RESULTS)
        .populate('categories', 'name slug')
        .lean();
    }

    res.status(200).json({
      data: businesses,
      category: { name: categoryDoc.name, slug: categoryDoc.slug },
      searchedNear: hasLocation ? { lat: latNum, lng: lngNum, radiusMiles: radiusNum } : null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/search/providers] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
