/**
 * server/api/v2/auth/bridge.js
 *
 * POST /api/v2/auth/bridge
 *
 * The missing link identified while investigating Ride for Phase 9 (see MIGRATION_PLAN.md): every
 * /api/v2 endpoint built in Phases 2-8 is gated by requireAuth, which only accepts a JWT tied to
 * an AppUser document. A person browsing the live site is authenticated as a SHARETRIBE user
 * (session cookie), not an AppUser - they have no such JWT and, usually, no AppUser at all yet.
 *
 * This endpoint bridges the two: it uses the same cookie-token-store + getSdk pattern every other
 * privileged Sharetribe endpoint already uses (see server/api/delete-account.js,
 * server/api/ride-initiate-privileged.js) to ask Sharetribe who is *really* signed in right now,
 * then finds-or-creates a matching AppUser by email and returns a normal Phase-2 JWT for it - the
 * exact same token shape signup.js/login.js hand back, so every existing /api/v2 endpoint works
 * unmodified once the frontend calls this first.
 *
 * Deliberately requires the Sharetribe account's email to be verified before it will link or
 * create anything. Without that check, someone could sign up on Sharetribe with an email address
 * they don't own (verification pending) and use this endpoint to reach into - or create - the
 * AppUser account tied to that address. Sharetribe's own "resend verification email" flow (already
 * part of the live site) is the honest way through this, not a dead end.
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createCookieTokenStore, getSdk } = require('../../../api-util/sdk');
const AppUser = require('../../../models/AppUser');
const { isConnected, connect } = require('../../../db/mongoose');
const { signAppUserToken } = require('../../../utils/jwt');

const SALT_ROUNDS = 10;

module.exports = async (req, res) => {
  const tokenStore = createCookieTokenStore(req, res);
  const sdk = getSdk(req, res, tokenStore);

  let currentUser;
  try {
    const response = await sdk.currentUser.show();
    currentUser = response?.data?.data;
  } catch (err) {
    // Covers "not logged in", an expired/invalid session cookie, and any transport failure
    // talking to Sharetribe alike - in every case, this endpoint can't vouch for who's asking, so
    // it can't hand out a token. See file header: we don't try to distinguish these cases further.
    res.status(401).json({
      error: 'not_logged_in_to_sharetribe',
      message: 'You need to be signed in to Servio before this can link your account.',
    });
    return;
  }

  if (!currentUser || !currentUser.id || !currentUser.attributes) {
    res.status(502).json({
      error: 'unexpected_sharetribe_response',
      message: 'Something went wrong reading your account. Please try again.',
    });
    return;
  }

  const sharetribeUserId = currentUser.id.uuid;
  const { email, emailVerified, profile } = currentUser.attributes;
  const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!trimmedEmail) {
    res.status(502).json({
      error: 'unexpected_sharetribe_response',
      message: 'Your Servio account has no email on file. Please try again.',
    });
    return;
  }
  if (!emailVerified) {
    res.status(403).json({
      error: 'sharetribe_email_unverified',
      message: 'Please verify your email address on Servio first, then try again.',
    });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'account_database_unavailable',
      message: 'Account linking is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    let appUser = await AppUser.findOne({ email: trimmedEmail });
    let created = false;

    if (appUser) {
      if (appUser.sharetribeUserId && appUser.sharetribeUserId !== sharetribeUserId) {
        // Should be unreachable in practice (Sharetribe enforces unique emails per account), but
        // this endpoint hands out account access, so it refuses rather than guessing when the
        // data doesn't line up.
        res.status(409).json({
          error: 'account_link_conflict',
          message: 'This email is already linked to a different account. Contact support.',
        });
        return;
      }
      if (!appUser.sharetribeUserId) {
        appUser.sharetribeUserId = sharetribeUserId;
        await appUser.save();
      }
    } else {
      const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), SALT_ROUNDS);
      appUser = await AppUser.create({
        email: trimmedEmail,
        passwordHash: unusablePasswordHash,
        firstName: (profile && profile.firstName) || 'Servio',
        lastName: (profile && profile.lastName) || 'User',
        sharetribeUserId,
      });
      created = true;
    }

    const token = signAppUserToken(appUser);
    res.status(200).json({ token, user: appUser.toSafeJSON(), created });
  } catch (err) {
    if (err && err.code === 11000) {
      res.status(409).json({
        error: 'email_in_use',
        message: 'This email is already linked to a different account. Please try again.',
      });
      return;
    }
    // eslint-disable-next-line no-console
    console.error('[api/v2/auth/bridge] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
