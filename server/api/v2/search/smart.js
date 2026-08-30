/**
 * server/api/v2/search/smart.js
 *
 * POST /api/v2/search/smart - the Groq-powered smart search box (spec addendum): understands a
 * natural-language query like "I need a cleaner who also cleans windows" or "change my
 * notification settings", classifies it for real (never a hardcoded/fake AI response), and
 * either runs a real provider search (via the shared server/utils/providerSearch.js, so results
 * are identical in quality to the plain category search) or returns a navigation target for the
 * client to route to. Manual category browsing always still works independently of this endpoint
 * - this only supplements it (spec section 43).
 *
 * Grounding: the model is only ever given the REAL active category list and a fixed allowlist of
 * navigation targets, and both are re-validated against those same lists after the model
 * responds - a hallucinated category slug or made-up navigation target is discarded, not trusted.
 *
 * Works for both signed-in and anonymous requests (optionalAuth); search history is only
 * persisted when there's a real signed-in AppUser to attach it to.
 */
const Category = require('../../../models/Category');
const { isConnected, connect } = require('../../../db/mongoose');
const { isGroqConfigured, groqChatJSON } = require('../../../utils/groqClient');
const { searchProviders, ProviderSearchError } = require('../../../utils/providerSearch');

// Fixed, real navigation targets the smart search box can send a user to. Keys are stable
// identifiers the frontend router maps to actual routes/UI actions - this list is intentionally
// small and grows only as those destinations are actually built (see tasks #39/#40).
const NAVIGATION_TARGETS = [
  'settings',
  'my_requests',
  'saved_providers',
  'messages',
  'payment_history',
  'reviews',
  'provider_dashboard',
  'provider_requests',
  'provider_profile_edit',
  'provider_earnings',
  'switch_to_provider_mode',
  'switch_to_customer_mode',
  'sort_recommended',
  'sort_highest_rated',
  'sort_closest',
  'sort_price',
  'sort_most_reviews',
  'sort_fastest_response',
];

const MAX_HISTORY_ENTRIES = 20;

module.exports = async (req, res) => {
  const { query, lat, lng, radiusMiles } = req.body || {};
  const trimmedQuery = typeof query === 'string' ? query.trim() : '';

  if (trimmedQuery.length < 3) {
    res.status(400).json({ error: 'invalid_query', message: 'Please enter at least 3 characters.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'database_unavailable',
      message: 'Search is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  // Persist search history for signed-in users regardless of whether AI classification below
  // succeeds - the history feature doesn't depend on Groq being configured.
  if (req.appUser) {
    req.appUser.searchHistory = [
      { query: trimmedQuery, searchedAt: new Date() },
      ...req.appUser.searchHistory.filter(h => h.query.toLowerCase() !== trimmedQuery.toLowerCase()),
    ].slice(0, MAX_HISTORY_ENTRIES);
    await req.appUser.save();
  }

  if (!isGroqConfigured()) {
    res.status(200).json({
      aiAvailable: false,
      message: 'AI assistance is currently unavailable. Browse categories manually below.',
      intent: null,
    });
    return;
  }

  try {
    const categories = await Category.find({ active: true }).select('name slug').lean();
    const categoryList = categories.map(c => c.slug).join(', ');

    const system = `You are the search classifier for a local-services marketplace. Classify the user's query into exactly one JSON object with this shape:
{"intent": "category_search" | "navigation" | "unclear", "categorySlug": string|null, "serviceKeywords": string[], "navigationTarget": string|null}

Rules:
- "categorySlug" MUST be one of exactly these existing category slugs, or null: ${categoryList}
- "navigationTarget" MUST be one of exactly these, or null: ${NAVIGATION_TARGETS.join(', ')}
- "serviceKeywords" are extra specific terms from the query beyond the category itself (e.g. for "a cleaner who also cleans windows", categorySlug might be "cleaning" and serviceKeywords would be ["windows"]).
- Use intent "navigation" only when the user is clearly asking to go to a part of the app (settings, messages, sorting, switching modes, etc), not asking to find a service.
- Use intent "unclear" if you cannot confidently match a category or a navigation target.
- Respond with ONLY the JSON object, no other text.`;

    const parsed = await groqChatJSON({ system, user: trimmedQuery });

    const intent = ['category_search', 'navigation', 'unclear'].includes(parsed.intent)
      ? parsed.intent
      : 'unclear';
    const categorySlug =
      typeof parsed.categorySlug === 'string' && categories.some(c => c.slug === parsed.categorySlug)
        ? parsed.categorySlug
        : null;
    const navigationTarget =
      typeof parsed.navigationTarget === 'string' && NAVIGATION_TARGETS.includes(parsed.navigationTarget)
        ? parsed.navigationTarget
        : null;
    const serviceKeywords = Array.isArray(parsed.serviceKeywords)
      ? parsed.serviceKeywords.filter(k => typeof k === 'string').slice(0, 5)
      : [];

    if (intent === 'navigation' && navigationTarget) {
      res.status(200).json({ aiAvailable: true, intent: 'navigation', navigationTarget });
      return;
    }

    if (intent === 'category_search' && categorySlug) {
      const result = await searchProviders({ categorySlug, lat, lng, radiusMiles, keywords: serviceKeywords });
      res.status(200).json({
        aiAvailable: true,
        intent: 'category_search',
        category: result.category,
        serviceKeywords,
        searchedNear: result.searchedNear,
        data: result.businesses,
      });
      return;
    }

    res.status(200).json({
      aiAvailable: true,
      intent: 'unclear',
      message: "Couldn't confidently match that to a category. Try browsing categories manually, or rephrase your search.",
    });
  } catch (err) {
    if (err instanceof ProviderSearchError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    // Real Groq failures (rate limit, network, invalid JSON from the model, etc.) degrade to
    // "AI unavailable" rather than a fake result or a hard 500 for what is a supplementary
    // feature - manual browsing must keep working regardless.
    // eslint-disable-next-line no-console
    console.error('[api/v2/search/smart] Groq classification failed:', err.code || err.message);
    res.status(200).json({
      aiAvailable: false,
      message: 'AI assistance is currently unavailable. Browse categories manually below.',
      intent: null,
    });
  }
};
