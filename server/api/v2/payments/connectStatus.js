/**
 * server/api/v2/payments/connectStatus.js
 *
 * GET /api/v2/payments/connect/status - the real, current Stripe Connect state for the
 * authenticated provider's Business. Always re-fetches from Stripe (not just the last cached
 * flag) so a provider who finished onboarding a moment ago sees it reflected immediately, rather
 * than waiting on the account.updated webhook - the webhook (see webhook.js) is the reliable
 * async path, this is the "check right now" path used right after the onboarding redirect.
 */
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');
const { getStripeClient } = require('../../../utils/stripeClient');

module.exports = async (req, res) => {
  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'provider_database_unavailable',
      message: 'Provider profiles are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const business = await Business.findOne({ owner: req.appUser._id });
    if (!business) {
      res.status(404).json({ error: 'no_business_profile', message: 'No provider profile yet.' });
      return;
    }
    if (!business.stripeConnectAccountId) {
      res.status(200).json({ connected: false, payoutsEnabled: false });
      return;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      res.status(200).json({
        connected: true,
        payoutsEnabled: business.stripeConnectPayoutsEnabled,
        stale: true,
        message: 'Payments are not configured (STRIPE_SECRET_KEY unset) - showing last known status.',
      });
      return;
    }

    const account = await stripe.accounts.retrieve(business.stripeConnectAccountId);
    const payoutsEnabled = !!account.payouts_enabled;
    if (payoutsEnabled !== business.stripeConnectPayoutsEnabled) {
      business.stripeConnectPayoutsEnabled = payoutsEnabled;
      await business.save();
    }

    res.status(200).json({
      connected: true,
      payoutsEnabled,
      chargesEnabled: !!account.charges_enabled,
      detailsSubmitted: !!account.details_submitted,
      requirementsDue: account.requirements?.currently_due || [],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/payments connectStatus] failed:', err.message);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
