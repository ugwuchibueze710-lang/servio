/**
 * server/api/v2/testerAuth/me.js
 *
 * GET /api/v2/tester-auth/me - returns the current tester account for the given bearer token, or
 * a 401 if it's missing, expired, or was never created (e.g. the server restarted - see
 * server/state/testerAccounts.js for why that clears every tester account).
 */
const { getAccount } = require('../../../state/testerAccounts');

module.exports = (req, res) => {
  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/i);
  const token = match ? match[1] : null;

  const account = token ? getAccount(token) : null;
  if (!account) {
    res.status(401).json({
      error: 'session_expired',
      message: 'Your test session has ended. Please sign up again.',
    });
    return;
  }

  res.status(200).json({ user: account });
};
