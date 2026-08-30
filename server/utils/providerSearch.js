/**
 * server/utils/providerSearch.js
 *
 * The real, shared provider-matching logic (spec sections 9/10/16): category + customer
 * location + customer radius + provider's own service radius + acceptingNewJobs, optionally
 * narrowed by free-text keywords across each provider's services (so "a cleaner who also does
 * windows" can actually find a business whose services array mentions "windows", not just an
 * exact category match). Used by both the plain REST search (server/api/v2/search/providers.js)
 * and the Groq-powered smart search (server/api/v2/search/smart.js) so there is exactly one
 * matching implementation, not two that can drift apart.
 */
const Business = require('../models/Business');
const Category = require('../models/Category');

const MILES_TO_METERS = 1609.34;
const DEFAULT_RADIUS_MILES = 25;
const MAX_RADIUS_MILES = 200;
const MAX_RESULTS = 50;

// Real ranking, not random or registration-order sorting (spec section 9). "recommended" blends
// four real, data-backed signals so a brand-new provider with zero reviews isn't buried forever,
// while consistently good, responsive, nearby providers surface first:
//   - a Bayesian-averaged rating (pulls low-review-count businesses toward a neutral midpoint
//     instead of letting a single 5-star review outrank a business with 40 reviews at 4.7),
//   - real response rate (requestsRespondedCount / requestsReceivedCount),
//   - proximity within the searched radius (closer is better; neutral weight if no location),
//   - completed-job volume (capped, so it rewards a track record without letting volume alone
//     dominate a business with a poor rating).
const SORT_OPTIONS = ['recommended', 'rating', 'distance', 'reviews'];
const BAYESIAN_PRIOR_MEAN = 4.0;
const BAYESIAN_PRIOR_WEIGHT = 5;
const COMPLETED_JOBS_CAP = 20;

const bayesianRating = (ratingAvg, ratingCount) =>
  (ratingCount * (ratingAvg || 0) + BAYESIAN_PRIOR_WEIGHT * BAYESIAN_PRIOR_MEAN) /
  (ratingCount + BAYESIAN_PRIOR_WEIGHT);

const recommendedScore = (business, radiusMeters) => {
  const ratingComponent = bayesianRating(business.ratingAvg, business.ratingCount) / 5; // 0..1
  const respondedCount = business.requestsRespondedCount || 0;
  const receivedCount = business.requestsReceivedCount || 0;
  const responseRateComponent = receivedCount > 0 ? respondedCount / receivedCount : 0.5; // neutral, no data yet
  const hasDistance = typeof business.distanceMeters === 'number' && radiusMeters > 0;
  const distanceComponent = hasDistance
    ? Math.max(0, 1 - business.distanceMeters / radiusMeters)
    : 0.5; // neutral when no location was searched
  const volumeComponent = Math.min((business.completedJobsCount || 0) / COMPLETED_JOBS_CAP, 1);

  return (
    ratingComponent * 0.4 + responseRateComponent * 0.2 + distanceComponent * 0.25 + volumeComponent * 0.15
  );
};

class ProviderSearchError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {Object} opts
 * @param {string} opts.categorySlug - required
 * @param {number} [opts.lat]
 * @param {number} [opts.lng]
 * @param {number} [opts.radiusMiles] - customer's search radius
 * @param {string[]} [opts.keywords] - free-text terms to match against each business's services
 * @param {string} [opts.sort] - one of SORT_OPTIONS; defaults to 'recommended'
 */
const searchProviders = async ({ categorySlug, lat, lng, radiusMiles, keywords, sort }) => {
  const sortBy = SORT_OPTIONS.includes(sort) ? sort : 'recommended';
  if (!categorySlug || typeof categorySlug !== 'string') {
    throw new ProviderSearchError('missing_category', 'A category is required.', 400);
  }

  const categoryDoc = await Category.findOne({ slug: categorySlug, active: true }).select('_id name slug');
  if (!categoryDoc) {
    throw new ProviderSearchError('unknown_category', `No such category: ${categorySlug}`, 404);
  }

  const hasLocation = lat !== undefined && lng !== undefined && lat !== null && lng !== null;
  let latNum;
  let lngNum;
  let radiusNum = DEFAULT_RADIUS_MILES;

  if (hasLocation) {
    latNum = Number(lat);
    lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      throw new ProviderSearchError('invalid_location', 'lat/lng must be valid coordinates.', 400);
    }
    const requestedRadius = Number(radiusMiles);
    if (Number.isFinite(requestedRadius) && requestedRadius > 0) {
      radiusNum = Math.min(requestedRadius, MAX_RADIUS_MILES);
    }
  }

  const baseFilter = { categories: categoryDoc._id, active: true, acceptingNewJobs: true };

  const cleanKeywords = Array.isArray(keywords)
    ? keywords.map(k => (typeof k === 'string' ? k.trim() : '')).filter(Boolean)
    : [];
  if (cleanKeywords.length > 0) {
    // Match a keyword against a business's bio or any of its service names/descriptions -
    // this is what lets "a cleaner who also cleans windows" surface a business whose services
    // list mentions "windows" even though "windows" isn't a category of its own.
    const keywordRegexes = cleanKeywords.map(k => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    baseFilter.$or = [
      { bio: { $in: keywordRegexes } },
      { 'services.name': { $in: keywordRegexes } },
      { 'services.description': { $in: keywordRegexes } },
    ];
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
          query: baseFilter,
        },
      },
      { $limit: MAX_RESULTS },
    ]);
    // Spec section 10: BOTH the customer's search radius (enforced above by $geoNear's
    // maxDistance) AND the provider's own service radius must be satisfied - a provider who
    // only serves 5 miles shouldn't show up for a customer 20 miles away just because the
    // customer searched with a 25-mile radius.
    businesses = businesses.filter(
      b => b.distanceMeters <= (b.serviceRadiusMiles || DEFAULT_RADIUS_MILES) * MILES_TO_METERS
    );
    businesses = await Business.populate(businesses, { path: 'categories', select: 'name slug' });
  } else {
    businesses = await Business.find(baseFilter).populate('categories', 'name slug').lean();
  }

  const radiusMeters = radiusNum * MILES_TO_METERS;
  businesses = businesses.map(b => ({ ...b, recommendedScore: recommendedScore(b, radiusMeters) }));

  const comparators = {
    recommended: (a, b) => b.recommendedScore - a.recommendedScore,
    rating: (a, b) =>
      bayesianRating(b.ratingAvg, b.ratingCount) - bayesianRating(a.ratingAvg, a.ratingCount),
    distance: (a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity),
    reviews: (a, b) => (b.ratingCount || 0) - (a.ratingCount || 0),
  };
  businesses.sort(comparators[sortBy]);
  if (!hasLocation && sortBy === 'distance') {
    // Distance sort with no searched location is meaningless - fall back to recommended rather
    // than presenting an arbitrary/misleading order.
    businesses.sort(comparators.recommended);
  }
  businesses = businesses.slice(0, MAX_RESULTS);

  return {
    businesses,
    category: { name: categoryDoc.name, slug: categoryDoc.slug },
    searchedNear: hasLocation ? { lat: latNum, lng: lngNum, radiusMiles: radiusNum } : null,
    sort: sortBy,
  };
};

module.exports = { searchProviders, ProviderSearchError, SORT_OPTIONS };
