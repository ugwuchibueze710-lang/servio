////////////////////////////////////////////////////////////////////////////
// SERVIO launch service areas - used for local /location/:citySlug pages //
////////////////////////////////////////////////////////////////////////////
//
// This does NOT restrict where the marketplace works - Mapbox-powered search works anywhere.
// It only powers a handful of genuinely useful local landing pages for SEO, per city, in SERVIO's
// initial launch market. To expand into a new city or state, add an entry here (a small content
// change, not a rewrite) - no code architecture change is required, since search itself is already
// location-agnostic.
//
// `bounds` mirrors src/config/configDefaultLocationSearches.js (NE corner, then SW corner).

const serviceAreas = [
  {
    slug: 'owensboro-ky',
    city: 'Owensboro',
    state: 'KY',
    label: 'Owensboro, KY',
    bounds: { ne: { lat: 37.855, lng: -86.98 }, sw: { lat: 37.695, lng: -87.25 } },
  },
  {
    slug: 'evansville-in',
    city: 'Evansville',
    state: 'IN',
    label: 'Evansville, IN',
    bounds: { ne: { lat: 38.08, lng: -87.42 }, sw: { lat: 37.86, lng: -87.72 } },
  },
  {
    slug: 'henderson-ky',
    city: 'Henderson',
    state: 'KY',
    label: 'Henderson, KY',
    bounds: { ne: { lat: 37.91, lng: -87.48 }, sw: { lat: 37.76, lng: -87.70 } },
  },
  {
    slug: 'madisonville-ky',
    city: 'Madisonville',
    state: 'KY',
    label: 'Madisonville, KY',
    bounds: { ne: { lat: 37.40, lng: -87.40 }, sw: { lat: 37.26, lng: -87.60 } },
  },
  {
    slug: 'newburgh-in',
    city: 'Newburgh',
    state: 'IN',
    label: 'Newburgh, IN',
    bounds: { ne: { lat: 38.00, lng: -87.35 }, sw: { lat: 37.90, lng: -87.47 } },
  },
  {
    slug: 'louisville-ky',
    city: 'Louisville',
    state: 'KY',
    label: 'Louisville, KY',
    bounds: { ne: { lat: 38.38, lng: -85.50 }, sw: { lat: 38.13, lng: -85.95 } },
  },
];

export default serviceAreas;
