/**
 * server/utils/jwt.js
 *
 * Thin wrapper around jsonwebtoken for the new custom backend's auth (see MIGRATION_PLAN.md
 * Phase 2). Tokens carry only the AppUser id and roles - never the password hash or other
 * sensitive fields - and are verified on every privileged /api/v2 request via
 * server/middleware/authenticate.js.
 */
const jwt = require('jsonwebtoken');

const DEFAULT_EXPIRY = '30d';

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Add it to your environment (Render dashboard, or .env for local dev) ' +
        'before using the new auth endpoints - see .env.example.'
    );
  }
  return secret;
};

const signAppUserToken = appUser =>
  jwt.sign(
    { sub: String(appUser._id), roles: appUser.roles, email: appUser.email },
    getSecret(),
    { expiresIn: DEFAULT_EXPIRY }
  );

const verifyToken = token => jwt.verify(token, getSecret());

module.exports = { signAppUserToken, verifyToken };
