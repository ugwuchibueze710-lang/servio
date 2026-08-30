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
