/**
 * server/api/v2/testerAuth/signup.js
 *
 * POST /api/v2/tester-auth/signup - creates a temporary, no-email "tester" account: just a name
 * and a role (customer/provider), no password, logged in immediately. See
 * server/state/testerAccounts.js for why these are in-memory and short-lived, and
 * MIGRATION_PLAN.md for why this exists alongside (not instead of) the real Sharetribe and
 * AppUser signup flows rather than replacing either of them yet.
 */
const { createAccount, ROLE_VALUES } = require('../../../state/testerAccounts');

const MAX_NAME_LENGTH = 60;

module.exports = (req, res) => {
  const { name, role } = req.body || {};
  const trimmedName = typeof name === 'string' ? name.trim() : '';

  if (!trimmedName) {
    res.status(400).json({ error: 'missing_name', message: 'Please enter a name.' });
    return;
  }
  if (trimmedName.length > MAX_NAME_LENGTH) {
    res.status(400).json({
      error: 'name_too_long',
      message: `Name must be ${MAX_NAME_LENGTH} characters or fewer.`,
    });
    return;
  }
  if (!ROLE_VALUES.includes(role)) {
    res.status(400).json({ error: 'invalid_role', message: 'Please choose Customer or Provider.' });
    return;
  }

  const { token, account } = createAccount({ name: trimmedName, role });
  res.status(201).json({ token, user: account });
};
