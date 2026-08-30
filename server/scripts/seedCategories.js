/**
 * server/scripts/seedCategories.js
 *
 * One-off script that populates the new MongoDB `categories` collection - this is what makes the
 * category system database-driven (spec section 1 & 35) instead of the static
 * src/config/configServiceCategories.js array. That file's content is intentionally mirrored here
 * (same ids/names/blurbs) as the *starting* data, but after this runs, the database - not the
 * source file - is the source of truth; edit categories going forward via the (future) admin CRUD
 * UI or directly in MongoDB, not by editing this script and re-running it blindly.
 *
 * Usage (from the project root, with MONGODB_URI set in the environment or .env):
 *   node server/scripts/seedCategories.js
 *
 * Safe to re-run: it upserts by slug, so running it again just updates existing rows rather than
 * duplicating them.
 */
require('../env').configureEnv();
const { connect, mongoose } = require('../db/mongoose');
const Category = require('../models/Category');

// id -> becomes `slug`. imagePath is served statically from /public, see
// server/scripts/README.md for how these PNGs got there and what still needs to be replaced with
// real photography per spec section 35.
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
  imageUrl: `/static/categoryIcons/${c.id}.png`,
  isRideCategory: !!c.isRideCategory,
  active: true,
  sortOrder: index,
}));

async function run() {
  const conn = await connect();
  if (!conn) {
    console.error(
      'MONGODB_URI is not set (or the connection failed) - nothing to seed. ' +
        'Set MONGODB_URI in your environment (or .env) and try again.'
    );
    process.exitCode = 1;
    return;
  }

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

  console.log(`Seed complete: ${created} created, ${updated} updated, ${CATEGORIES.length} total.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
