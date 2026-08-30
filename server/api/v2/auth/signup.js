/**
 * server/api/v2/auth/signup.js
 *
 * POST /api/v2/auth/signup - creates a real AppUser (bcrypt-hashed password, never stored or
 * logged in plain text) and returns a signed JWT plus the safe (password-free) user record. This
 * is the new backend's real signup; see MIGRATION_PLAN.md Phase 2 for why it lives alongside the
 * still-active Sharetribe signup rather than replacing it yet.
 */
const bcrypt = require('bcryptjs');
const AppUser = require('../../../models/AppUser');
const { isConnected, connect } = require('../../../db/mongoose');
const { signAppUserToken } = require('../../../utils/jwt');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 10;

module.exports = async (req, res) => {
  const { email, password, firstName, lastName, phone } = req.body || {};

  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const trimmedFirstName = typeof firstName === 'string' ? firstName.trim() : '';
  const trimmedLastName = typeof lastName === 'string' ? lastName.trim() : '';

  if (!EMAIL_RE.test(trimmedEmail)) {
    res.status(400).json({ error: 'invalid_email', message: 'Please enter a valid email address.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res
      .status(400)
      .json({ error: 'weak_password', message: 'Password must be at least 8 characters long.' });
    return;
  }
  if (!trimmedFirstName || !trimmedLastName) {
    res
      .status(400)
      .json({ error: 'missing_name', message: 'First and last name are both required.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'account_database_unavailable',
      message: 'Account creation is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const existing = await AppUser.findOne({ email: trimmedEmail });
    if (existing) {
      res
        .status(409)
        .json({ error: 'email_in_use', message: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const appUser = await AppUser.create({
      email: trimmedEmail,
      passwordHash,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      phone: typeof phone === 'string' ? phone.trim() : undefined,
    });

    const token = signAppUserToken(appUser);
    res.status(201).json({ token, user: appUser.toSafeJSON() });
  } catch (err) {
    if (err && err.code === 11000) {
      // Race: two signups with the same email landed at once - the unique index caught it.
      res
        .status(409)
        .json({ error: 'email_in_use', message: 'An account with this email already exists.' });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[api/v2/auth/signup] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
