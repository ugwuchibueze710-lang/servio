/**
 * server/api/v2/me/setMode.js
 *
 * PATCH /api/v2/me/mode - persists which of the two modes (spec section 1: exactly one account,
 * two modes, never a separate signup flow) this AppUser is currently in. A real, tiny database
 * write - not just a client-side/localStorage preference - so the chosen mode survives across
 * devices and browser sessions, the same way locationPref does.
 */
const { isConnected, connect } = require('../../../db/mongoose');

const VALID_MODES = ['customer', 'provider'];

module.exports = async (req, res) => {
  const { activeMode } = req.body || {};

  if (!VALID_MODES.includes(activeMode)) {
    res.status(400).json({ error: 'invalid_mode', message: "activeMode must be 'customer' or 'provider'." });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'database_unavailable',
      message: 'The account database is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  req.appUser.activeMode = activeMode;
  await req.appUser.save();
  res.status(200).json({ activeMode: req.appUser.activeMode });
};
