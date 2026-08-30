/**
 * server/api/v2/testerAuth/logout.js
 *
 * POST /api/v2/tester-auth/logout - deletes the tester account for the given bearer token right
 * away, instead of waiting for it to expire on its own.
 */
const { deleteAccount } = require('../../../state/testerAccounts');

module.exports = (req, res) => {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/i);
  const token = match ? match[1] : null;

  if (token) {
    deleteAccount(token);
  }
  res.status(200).json({ ok: true });
};
