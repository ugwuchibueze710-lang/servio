/**
 * server/state/testerAccounts.js
 *
 * In-memory store for the temporary, no-email "tester" accounts (see
 * server/api/v2/testerAuth/*.js). These are deliberately NOT stored in MongoDB - Mongo isn't set
 * up yet, and these accounts are meant to be throwaway anyway (just a name + a role, auto-deleted
 * a few hours after creation) so testers can get into the app immediately with no email/password.
 *
 * Being in-memory means every account here also disappears on every server restart/redeploy -
 * that's an accepted trade-off for "works with no database configured", not a bug. Once real
 * accounts (server/models/AppUser.js) are wired into the rest of the app, this whole file - and
 * the /v2/tester-auth/* routes that use it - can be deleted.
 */
const crypto = require('crypto');

const ROLE_VALUES = ['customer', 'provider'];

const DEFAULT_TTL_HOURS = 4;
const ttlHours = Number(process.env.TESTER_SESSION_TTL_HOURS) || DEFAULT_TTL_HOURS;
const TTL_MS = ttlHours * 60 * 60 * 1000;

// token -> { id, name, role, createdAt, expiresAt, timer }
const accounts = new Map();

const toSafeAccount = account =>
  account && {
    id: account.id,
    name: account.name,
    role: account.role,
    createdAt: account.createdAt,
    expiresAt: account.expiresAt,
  };

const createAccount = ({ name, role }) => {
  const token = crypto.randomBytes(24).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);

  const account = {
    id: crypto.randomBytes(8).toString('hex'),
    name,
    role,
    createdAt: now,
    expiresAt,
  };

  account.timer = setTimeout(() => {
    accounts.delete(token);
  }, TTL_MS);
  // Don't let this cleanup timer keep the Node process alive by itself.
  if (account.timer && typeof account.timer.unref === 'function') {
    account.timer.unref();
  }

  accounts.set(token, account);
  return { token, account: toSafeAccount(account) };
};

const getAccount = token => {
  const account = accounts.get(token);
  if (!account) return null;
  if (Date.now() >= account.expiresAt.getTime()) {
    // Belt-and-suspenders: the setTimeout above should have already removed this, but a sleeping
    // free-tier instance can wake up after its timers were due to fire.
    clearTimeout(account.timer);
    accounts.delete(token);
    return null;
  }
  return toSafeAccount(account);
};

const deleteAccount = token => {
  const account = accounts.get(token);
  if (account && account.timer) {
    clearTimeout(account.timer);
  }
  accounts.delete(token);
};

module.exports = { createAccount, getAccount, deleteAccount, ROLE_VALUES, TTL_MS };
