/**
 * server/db/mongoose.js
 *
 * Connection helper for the new custom backend (MongoDB via Mongoose), which lives alongside the
 * existing Sharetribe integration during the migration - see server/models/README.md for why.
 *
 * Deliberately tolerant of MONGODB_URI being unset: routes that depend on it (server/api/v2/*)
 * check `isConnected()` themselves and return a clear 503 instead of throwing, so the rest of the
 * app (still running on Sharetribe) keeps working even before a database is provisioned. Once
 * MONGODB_URI is set in the environment (Render dashboard, or .env for local dev) and the server
 * restarts, these routes come alive with no code changes.
 */
const mongoose = require('mongoose');

let connectPromise = null;

// Runs once per process, right after the very first successful connection - not on every
// connect() call, since connectPromise already memoizes the connection itself. Seeds the real
// service-category list (server/scripts/seedCategoriesData.js - the same data
// server/scripts/seedCategories.js seeds when run by hand) if and only if the categories
// collection is genuinely empty, so this never overwrites categories an admin has since edited.
//
// Why this exists: MONGODB_URI can go from "unset"/"unreachable" to "connected" at any time -
// a first-time setup, fixing an Atlas IP allow-list, rotating the connection string - and each
// time, the live site would otherwise keep showing "no such category" until someone remembered
// to SSH/shell in and run the seed script by hand. Free-tier Render has no shell/one-off-job
// access at all, so "run it by hand" in practice meant asking whoever's deploying to run it
// locally against the production database - real friction for zero benefit, since this data is
// static and safe to seed automatically. Errors here are logged but never fatal: a failed seed
// just means categories stay empty until the next successful connection, exactly like today.
const seedCategoriesIfEmpty = async () => {
  try {
    // Lazy require: avoids a require-cycle risk if a model file ever imports this module.
    const Category = require('../models/Category');
    const existingCount = await Category.estimatedDocumentCount();
    if (existingCount > 0) {
      return;
    }
    const { seedCategories } = require('../scripts/seedCategoriesData');
    const { created, updated, total } = await seedCategories(Category);
    // eslint-disable-next-line no-console
    console.log(`[mongo] auto-seeded categories: ${created} created, ${updated} updated, ${total} total`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mongo] auto-seed categories failed:', err.message);
  }
};

const connect = () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return Promise.resolve(null);
  }
  if (!connectPromise) {
    connectPromise = mongoose
      .connect(uri, { serverSelectionTimeoutMS: 8000 })
      .then(() => {
        // eslint-disable-next-line no-console
        console.log('[mongo] connected');
        seedCategoriesIfEmpty();
        return mongoose.connection;
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('[mongo] connection failed:', err.message);
        connectPromise = null; // allow a later request to retry rather than staying stuck
        return null;
      });
  }
  return connectPromise;
};

const isConnected = () => mongoose.connection.readyState === 1;

module.exports = { connect, isConnected, mongoose };
