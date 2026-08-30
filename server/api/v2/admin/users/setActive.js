/**
 * server/api/v2/admin/users/setActive.js
 *
 * PATCH /api/v2/admin/users/:id/active - suspend or reactivate an account. Deliberately does NOT
 * allow granting/revoking isAdmin through this (or any) API endpoint - see
 * server/middleware/requireAdmin.js for why that's a hard line, not an oversight. An admin also
 * can't deactivate their own account through this endpoint (a real self-lockout guard, not a
 * hypothetical).
 */
const AppUser = require('../../../../models/AppUser');
const { isConnected, connect } = require('../../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { active } = req.body || {};

  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'invalid_active', message: 'active must be true or false.' });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'account_database_unavailable',
      message: 'The account database is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    if (String(id) === String(req.appUser._id) && !active) {
      res.status(400).json({ error: 'cannot_deactivate_self', message: 'You cannot deactivate your own account.' });
      return;
    }

    const user = await AppUser.findById(id);
    if (!user) {
      res.status(404).json({ error: 'user_not_found', message: 'This account could not be found.' });
      return;
    }
    user.active = active;
    await user.save();

    res.status(200).json({ user: user.toSafeJSON ? user.toSafeJSON() : user });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/admin/users setActive] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
