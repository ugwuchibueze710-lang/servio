/**
 * server/scripts/seedCategories.js
 *
 * One-off script that populates the new MongoDB `categories` collection - this is what makes the
 * category system database-driven (spec section 1 & 35) instead of the static
 * src/config/configServiceCategories.js array.
 *
 * Usage (from the project root, with MONGODB_URI set in the environment or .env):
 *   node server/scripts/seedCategories.js
 *
 * Safe to re-run: it upserts by slug, so running it again just updates existing rows rather than
 * duplicating them.
 *
 * NOTE: this no longer needs to be run by hand against production. server/db/mongoose.js now
 * runs this same seed data automatically, once, the first time the server successfully connects
 * to a database whose `categories` collection is empty - see its own comment for why. This script
 * is kept for local development and for deliberately re-seeding/updating the category list later
 * (e.g. after editing server/scripts/seedCategoriesData.js).
 */
require('../env').configureEnv();
const { connect, mongoose } = require('../db/mongoose');
const Category = require('../models/Category');
const { seedCategories } = require('./seedCategoriesData');

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

  const { created, updated, total } = await seedCategories(Category);
  console.log(`Seed complete: ${created} created, ${updated} updated, ${total} total.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
