/**
 * server/api/v2/auth/login.js
 *
 * POST /api/v2/auth/login - verifies email + password against the real bcrypt hash on the
 * AppUser record and returns a signed JWT. Deliberately returns the same generic error for
 * "no such email" and "wrong password" so login can't be used to enumerate registered emails.
 */
const bcrypt = require('bcryptjs');
const AppUser = require('../../../models/AppUser');
const { isConnected, connect } = require('../../../db/mongoose');
const { signAppUserToken } = require('../../../utils/jwt');

const GENERIC_INVALID = { error: 'invalid_credentials', message: 'Incorrect email or password.' };

module.exports = async (req, res) => {
  const { email, password } = req.body || {};
  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!trimmedEmail || typeof password !== 'string' || !password) {
    res.status(400).json(GENERIC_INVALID);
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'account_database_unavailable',
      message: 'Sign in is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const appUser = await AppUser.findOne({ email: trimmedEmail }).select('+passwordHash');
    if (!appUser || !appUser.active) {
      res.status(401).json(GENERIC_INVALID);
      return;
    }

    const passwordMatches = await bcrypt.compare(password, appUser.passwordHash);
    if (!passwordMatches) {
      res.status(401).json(GENERIC_INVALID);
      return;
    }

    const token = signAppUserToken(appUser);
    res.status(200).json({ token, user: appUser.toSafeJSON() });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/auth/login] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
