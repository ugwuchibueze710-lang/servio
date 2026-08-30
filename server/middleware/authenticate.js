/**
 * server/middleware/authenticate.js
 *
 * Express middleware for the new custom backend's JWT auth (see MIGRATION_PLAN.md Phase 2).
 * Verifies the `Authorization: Bearer <token>` header, loads the real AppUser from MongoDB, and
 * attaches it to `req.appUser` (never a fake/stubbed user - a missing or invalid token, an
 * unreadable database, or a deleted/deactivated account all produce real, distinct error
 * responses rather than silently proceeding).
 *
 * Two exports:
 *   - requireAuth: 401s if there's no valid, current AppUser.
 *   - optionalAuth: attaches req.appUser when a valid token is present, otherwise proceeds with
 *     req.appUser left undefined (for endpoints usable both logged-in and anonymous).
 */
const { verifyToken } = require('../utils/jwt');
const AppUser = require('../models/AppUser');
const { isConnected, connect } = require('../db/mongoose');

const extractToken = req => {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/i);
  return match ? match[1] : null;
};

const loadCurrentAppUser = async req => {
  const token = extractToken(req);
  if (!token) {
    return { appUser: null, error: null };
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return { appUser: null, error: 'invalid_token' };
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    return { appUser: null, error: 'database_unavailable' };
  }

  const appUser = await AppUser.findById(payload.sub);
  if (!appUser || !appUser.active) {
    return { appUser: null, error: 'account_not_found' };
  }

  return { appUser, error: null };
};

const requireAuth = async (req, res, next) => {
  try {
    const { appUser, error } = await loadCurrentAppUser(req);
    if (!appUser) {
      const status = error === 'database_unavailable' ? 503 : 401;
      const message =
        error === 'database_unavailable'
          ? 'The account database is not configured yet (MONGODB_URI is unset or unreachable).'
          : error === 'account_not_found'
          ? 'This account no longer exists or has been deactivated.'
          : 'Please sign in again.';
      res.status(status).json({ error: error || 'unauthenticated', message });
      return;
    }
    req.appUser = appUser;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[authenticate] requireAuth failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const { appUser } = await loadCurrentAppUser(req);
    req.appUser = appUser || undefined;
    next();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[authenticate] optionalAuth failed:', err);
    req.appUser = undefined;
    next();
  }
};

module.exports = { requireAuth, optionalAuth };
