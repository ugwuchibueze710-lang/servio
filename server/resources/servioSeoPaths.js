// Slugs for SERVIO's SEO landing pages, used by sitemap.js (server-side, CommonJS).
//
// Kept as plain string lists here (rather than importing the ES module config used by the client
// bundle) because the Express server runs as CommonJS and isn't part of the webpack build.
//
// IMPORTANT: keep these lists in sync with the `id`/`slug` values in:
//  - src/config/configServiceCategories.js
//  - src/config/configServiceAreas.js
// A mismatch just means a page is missing from the sitemap - it does not break the page itself,
// since routing reads the client-side config directly.

const serviceCategories = [
  'home-improvement',
  'cleaning',
  'landscaping',
  'plumbing',
  'electrical',
  'hvac',
  'moving',
  'auto-services',
  'photography',
  'events',
  'beauty',
  'pet-services',
  'technology',
  'tutoring',
  'personal-services',
  'business-services',
  'handyman',
  'lawn-care',
  'pressure-washing',
  'painting',
];

const serviceAreas = [
  'owensboro-ky',
  'evansville-in',
  'henderson-ky',
  'madisonville-ky',
  'newburgh-in',
  'louisville-ky',
];

module.exports = { serviceCategories, serviceAreas };
