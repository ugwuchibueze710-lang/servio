/**
 * server/scripts/seedCategoriesData.js
 *
 * The actual category data + upsert logic, factored out of seedCategories.js so it can be run
 * two ways: manually via `node server/scripts/seedCategories.js` (see that file), and
 * automatically the first time the server successfully connects to a real database with an empty
 * `categories` collection (see server/db/mongoose.js) - so a fresh MongoDB (e.g. right after
 * MONGODB_URI is first configured, or Network Access is fixed) never leaves the live site stuck
 * showing "no such category" until someone remembers to run the script by hand.
 *
 * Same data as src/config/configServiceCategories.js (that file is the pre-database static
 * fallback; this collection becomes the real source of truth once seeded) - see that file's own
 * comment, and this file's usage note in seedCategories.js, for the full rationale.
 */
const CATEGORIES = [
  { id: 'ride', name: 'Ride', blurb: 'Request a ride in minutes - real-time driver matching, live tracking, and upfront pricing, all through Servio.', isRideCategory: true },
  { id: 'home-improvement', name: 'Home Improvement', blurb: 'From carpentry to full remodels, connect with local home improvement pros who show up, quote fairly, and get it done right.' },
  { id: 'cleaning', name: 'Cleaning', blurb: 'House cleaning, deep cleans, and move-in/move-out cleaning from vetted local cleaners - book in minutes.' },
  { id: 'landscaping', name: 'Landscaping', blurb: 'Landscape design, mulching, tree trimming and irrigation work from local landscaping crews.' },
  { id: 'plumbing', name: 'Plumbing', blurb: 'Leaky faucets, water heaters, clogged drains and more - reach licensed local plumbers fast.' },
  { id: 'electrical', name: 'Electrical', blurb: 'Panel upgrades, wiring, fixtures and repairs from licensed local electricians.' },
  { id: 'hvac', name: 'HVAC', blurb: 'Heating and cooling repair, tune-ups, and installs from local HVAC technicians.' },
  { id: 'moving', name: 'Moving', blurb: 'Local moving crews for packing, loading, and furniture delivery across the region.' },
  { id: 'auto-services', name: 'Auto Services', blurb: 'Mobile mechanics, auto detailing, and car washes that come to you.' },
  { id: 'photography', name: 'Photography', blurb: 'Local photographers for portraits, events, real estate, and more.' },
  { id: 'events', name: 'Events', blurb: 'Event planners, caterers, and DJs to make your next event run smoothly.' },
  { id: 'beauty', name: 'Beauty', blurb: 'Local hair, nail, and beauty professionals - in-studio or mobile.' },
  { id: 'pet-services', name: 'Pet Services', blurb: 'Pet grooming, sitting, and dog walking from trusted local pet pros.' },
  { id: 'technology', name: 'Technology', blurb: 'Computer repair, smart home setup, and IT help from local tech pros.' },
  { id: 'tutoring', name: 'Tutoring', blurb: 'Local tutors for academic subjects, test prep, and music lessons.' },
  { id: 'personal-services', name: 'Personal Services', blurb: 'Personal assistants, errand runners, and other personal services near you.' },
  { id: 'business-services', name: 'Business Services', blurb: 'Bookkeeping, notary, marketing and other business services from local providers.' },
  { id: 'handyman', name: 'Handyman', blurb: 'General repairs, furniture assembly, and honey-do lists handled by local handymen.' },
  { id: 'lawn-care', name: 'Lawn Care', blurb: 'Mowing, edging, and seasonal lawn care from local crews.' },
  { id: 'pressure-washing', name: 'Pressure Washing', blurb: 'Driveways, siding, decks and more - refreshed by local pressure washing pros.' },
  { id: 'painting', name: 'Painting', blurb: 'Interior and exterior painting from local painting contractors.' },
].map((c, index) => ({
  slug: c.id,
  name: c.name,
  blurb: c.blurb,
  imageUrl: `/static/categoryIcons/${c.id}.jpg`,
  isRideCategory: !!c.isRideCategory,
  active: true,
  sortOrder: index,
}));

/**
 * Upserts every category in CATEGORIES by slug. Safe to call repeatedly - existing rows are
 * updated in place, never duplicated. Takes the Category model as a parameter (rather than
 * requiring server/models/Category itself) so callers control connection lifecycle.
 */
const seedCategories = async Category => {
  let created = 0;
  let updated = 0;
  for (const cat of CATEGORIES) {
    const res = await Category.findOneAndUpdate(
      { slug: cat.slug },
      { $set: cat },
      { upsert: true, new: false, setDefaultsOnInsert: true }
    );
    if (res) updated += 1;
    else created += 1;
  }
  return { created, updated, total: CATEGORIES.length };
};

module.exports = { CATEGORIES, seedCategories };
