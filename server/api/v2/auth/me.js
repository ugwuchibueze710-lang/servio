/**
 * server/api/v2/auth/me.js
 *
 * GET /api/v2/auth/me - returns the currently authenticated AppUser (as resolved by
 * server/middleware/authenticate.js's requireAuth, which is mounted in front of this handler in
 * apiRouter.js). A real round trip to the database on every call - not a decoded-token echo - so
 * a deactivated or deleted account is reflected immediately.
 */
module.exports = async (req, res) => {
  res.status(200).json({ user: req.appUser.toSafeJSON() });
};
