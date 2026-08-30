/**
 * server/middleware/requireAdmin.js
 *
 * Gate for every /api/v2/admin/* route. Must run AFTER requireAuth (so req.appUser is already
 * the real, database-loaded account) and simply checks the real isAdmin flag on that account -
 * there is no client-supplied "am I an admin" flag anywhere. Deliberately no API exists to grant
 * isAdmin to an account (see server/scripts/makeAdmin.js) - that has to be done with direct
 * database access, so there's no path for a regular account to escalate itself to admin through
 * this API.
 */
module.exports = (req, res, next) => {
  if (!req.appUser || !req.appUser.isAdmin) {
    res.status(403).json({ error: 'admin_only', message: 'This action requires an administrator account.' });
    return;
  }
  next();
};
