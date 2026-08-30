/**
 * server/api/v2/auth/testSignup.js
 *
 * POST /api/v2/auth/test-signup
 *
 * The "test mode" entry point: name + email only, no password, and you're in immediately. This is
 * NOT a second, disposable identity system like the old in-memory server/state/testerAccounts.js -
 * it creates/reuses a REAL AppUser document in MongoDB, the same model signup.js and bridge.js
 * use, and returns the exact same JWT shape. That's deliberate: when real password-based login
 * gets added later, it's just adding a password to an account that already exists here - nobody
 * has to migrate or lose their account/roles.
 *
 * Idempotent by email, on purpose: signing in again with the same email logs back into the same
 * account rather than failing with "email already in use" (unlike signup.js) - there's no
 * password to get right or wrong in test mode, so treating a repeat email as "log back in" is the
 * only behavior that makes sense here. An account created this way gets an unusable random
 * password hash (bcrypt of 32 random bytes, same technique as bridge.js) so nobody could log in as
 * it through the real password-based signup/login endpoints even if they guessed the email.
 *
 * Deliberately not wired into any route Sharetribe currently serves (/login, /signup) - this is
 * reachable only from the new, parallel pages until there's been a real end-to-end test against
 * live MongoDB/Stripe/Mapbox and the live site is actually switched over.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const AppUser = require('../../../models/AppUser');
const { isConnected, connect } = require('../../../db/mongoose');
const { signAppUserToken } = require('../../../utils/jwt');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 10;
const REQUESTABLE_ROLES = ['customer', 'provider', 'driver'];

module.exports = async (req, res) => {
  const { email, firstName, lastName, role } = req.body || {};

  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
  const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : '';
  const requestedRole = REQUESTABLE_ROLES.includes(role) ? role : 'customer';

  if (!EMAIL_RE.test(trimmedEmail)) {
    res.status(400).json({ error: 'invalid_email', message: 'Please enter a valid email address.' });
    return;
  }
  if (!trimmedFirstName) {
    res.status(400).json({ error: 'missing_name', message: 'Please enter your name.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'account_database_unavailable',
      message: 'Test-mode sign in is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    let appUser = await AppUser.findOne({ email: trimmedEmail });
    let created = false;

    if (appUser) {
      // Same email, second visit - log back into the same account instead of failing. Add the
      // newly-requested role if they picked a different one this time (e.g. came back as a
      // provider after first trying it as a customer) rather than overwriting their roles.
      if (!appUser.roles.includes(requestedRole)) {
        appUser.roles = [...appUser.roles, requestedRole];
        await appUser.save();
      }
    } else {
      const unusablePasswordHash = await bcrypt.hash(
        crypto.randomBytes(32).toString('hex'),
        SALT_ROUNDS
      );
      appUser = await AppUser.create({
        email: trimmedEmail,
        passwordHash: unusablePasswordHash,
        firstName: trimmedFirstName,
        lastName: trimmedLastName || 'Servio',
        roles: [requestedRole],
      });
      created = true;
    }

    const token = signAppUserToken(appUser);
    res.status(200).json({ token, user: appUser.toSafeJSON(), created });
  } catch (err) {
    if (err && err.code === 11000) {
      // Race: two test-signups with the same email landed at once - just log into whichever won.
      const appUser = await AppUser.findOne({ email: trimmedEmail });
      if (appUser) {
        const token = signAppUserToken(appUser);
        res.status(200).json({ token, user: appUser.toSafeJSON(), created: false });
        return;
      }
    }
    // eslint-disable-next-line no-console
    console.error('[api/v2/auth/test-signup] failed:', err);
    res
      .status(500)
      .json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
