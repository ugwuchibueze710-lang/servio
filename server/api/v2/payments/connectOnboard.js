/**
 * server/api/v2/payments/connectOnboard.js
 *
 * POST /api/v2/payments/connect/onboard - creates (once) the provider's real Stripe Connect
 * Express account and returns a real, single-use Account Link URL for Stripe's own hosted
 * onboarding flow (spec section 32: "Providers must complete the required Stripe Connect
 * onboarding before receiving payouts"). Never fakes "Connect complete" - completion is only
 * ever known from Stripe itself, via connectStatus.js / the account.updated webhook.
 */
const Business = require('../../../models/Business');
const { isConnected, connect } = require('../../../db/mongoose');
const { getStripeClient } = require('../../../utils/stripeClient');
const { getRootURL } = require('../../../api-util/rootURL');

module.exports = async (req, res) => {
  const stripe = getStripeClient();
  if (!stripe) {
    res.status(503).json({
      error: 'payments_unavailable',
      message: 'Payments are not configured yet (STRIPE_SECRET_KEY is unset).',
    });
    return;
  }

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
      res.status(404).json({
        error: 'no_business_profile',
        message: 'Complete your provider profile before setting up payouts.',
      });
      return;
    }

    if (!business.stripeConnectAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: req.appUser.email,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { businessId: String(business._id), appUserId: String(req.appUser._id) },
      });
      business.stripeConnectAccountId = account.id;
      await business.save();
    }

    // Both URLs point back at the real provider profile/settings page (no separate
    // "stripe-onboarding" route exists for this backend) - it re-checks the real status via
    // GET /api/v2/payments/connect/status on load whenever these query params are present.
    const rootUrl = getRootURL({});
    const accountLink = await stripe.accountLinks.create({
      account: business.stripeConnectAccountId,
      refresh_url: `${rootUrl}/provider-profile-v2?stripe=refresh`,
      return_url: `${rootUrl}/provider-profile-v2?stripe=complete`,
      type: 'account_onboarding',
    });

    res.status(200).json({ url: accountLink.url });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/payments connectOnboard] failed:', err.message);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
