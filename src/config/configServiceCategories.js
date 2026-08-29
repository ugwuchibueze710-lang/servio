/////////////////////////////////////////////////////////////////////////////
// SERVIO service categories - used for local /services/:categorySlug pages //
/////////////////////////////////////////////////////////////////////////////
//
// IMPORTANT: The real, canonical category list that listings are actually filterable by lives in
// Sharetribe Console (Build > Content > Categories), because that's what the Marketplace API and
// SearchPage's `pub_categoryLevel1` filter actually query against. This file just powers the
// marketing/SEO landing pages at /services/:categorySlug.
//
// The `id` values here MUST match the top-level category `id`s you create in Console (see
// sharetribe-setup/categories.json, which lists the same 20 categories in the exact JSON shape
// Console/Sharetribe CLI expects) - otherwise the "Browse verified pros" button on these pages will
// link to a category filter that returns no results.
//
// Admins can add/remove/edit service categories without any code change or redeploy by editing
// Console's category list; to add a matching SEO landing page for a brand new category, add one
// entry below (a small, low-risk content change - not a rewrite of the application).

const serviceCategories = [
  {
    id: 'ride',
    name: 'Ride',
    shortName: 'ride',
    blurb:
      'Request a ride in minutes - real-time driver matching, live tracking, and upfront pricing, all through Servio.',
  },
  {
    id: 'home-improvement',
    name: 'Home Improvement',
    shortName: 'home improvement',
    blurb:
      'From carpentry to full remodels, connect with local home improvement pros who show up, quote fairly, and get it done right.',
  },
  {
    id: 'cleaning',
    name: 'Cleaning',
    shortName: 'cleaning',
    blurb:
      'House cleaning, deep cleans, and move-in/move-out cleaning from vetted local cleaners - book in minutes.',
  },
  {
    id: 'landscaping',
    name: 'Landscaping',
    shortName: 'landscaping',
    blurb:
      'Landscape design, mulching, tree trimming and irrigation work from local landscaping crews.',
  },
  {
    id: 'plumbing',
    name: 'Plumbing',
    shortName: 'plumbing',
    blurb: 'Leaky faucets, water heaters, clogged drains and more - reach licensed local plumbers fast.',
  },
  {
    id: 'electrical',
    name: 'Electrical',
    shortName: 'electrical',
    blurb: 'Panel upgrades, wiring, fixtures and repairs from licensed local electricians.',
  },
  {
    id: 'hvac',
    name: 'HVAC',
    shortName: 'HVAC',
    blurb: 'Heating and cooling repair, tune-ups, and installs from local HVAC technicians.',
  },
  {
    id: 'moving',
    name: 'Moving',
    shortName: 'moving',
    blurb: 'Local moving crews for packing, loading, and furniture delivery across the region.',
  },
  {
    id: 'auto-services',
    name: 'Auto Services',
    shortName: 'auto services',
    blurb: 'Mobile mechanics, auto detailing, and car washes that come to you.',
  },
  {
    id: 'photography',
    name: 'Photography',
    shortName: 'photography',
    blurb: 'Local photographers for portraits, events, real estate, and more.',
  },
  {
    id: 'events',
    name: 'Events',
    shortName: 'events',
    blurb: 'Event planners, caterers, and DJs to make your next event run smoothly.',
  },
  {
    id: 'beauty',
    name: 'Beauty',
    shortName: 'beauty',
    blurb: 'Local hair, nail, and beauty professionals - in-studio or mobile.',
  },
  {
    id: 'pet-services',
    name: 'Pet Services',
    shortName: 'pet services',
    blurb: 'Pet grooming, sitting, and dog walking from trusted local pet pros.',
  },
  {
    id: 'technology',
    name: 'Technology',
    shortName: 'technology',
    blurb: 'Computer repair, smart home setup, and IT help from local tech pros.',
  },
  {
    id: 'tutoring',
    name: 'Tutoring',
    shortName: 'tutoring',
    blurb: 'Local tutors for academic subjects, test prep, and music lessons.',
  },
  {
    id: 'personal-services',
    name: 'Personal Services',
    shortName: 'personal services',
    blurb: 'Personal assistants, errand runners, and other personal services near you.',
  },
  {
    id: 'business-services',
    name: 'Business Services',
    shortName: 'business services',
    blurb: 'Bookkeeping, notary, marketing and other business services from local providers.',
  },
  {
    id: 'handyman',
    name: 'Handyman',
    shortName: 'handyman',
    blurb: 'General repairs, furniture assembly, and honey-do lists handled by local handymen.',
  },
  {
    id: 'lawn-care',
    name: 'Lawn Care',
    shortName: 'lawn care',
    blurb: 'Mowing, edging, and seasonal lawn care from local crews.',
  },
  {
    id: 'pressure-washing',
    name: 'Pressure Washing',
    shortName: 'pressure washing',
    blurb: 'Driveways, siding, decks and more - refreshed by local pressure washing pros.',
  },
  {
    id: 'painting',
    name: 'Painting',
    shortName: 'painting',
    blurb: 'Interior and exterior painting from local painting contractors.',
  },
];

export default serviceCategories;
