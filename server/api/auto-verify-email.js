/**
 * server/api/auto-verify-email.js
 *
 * POST /api/auto-verify-email - best-effort, called by the client right after a brand new
 * Sharetribe signup + login (see src/ducks/auth.duck.js's signupThunk and
 * src/util/api.js#autoVerifyEmail). Sharetribe always sends its own verification email on
 * signup and there's no setting to turn that off - but it also never blocks app access while
 * unverified. This endpoint closes that gap from the other side: it marks the account verified
 * immediately, via Sharetribe's separate Integration API, so nobody has to notice or act on that
 * email at all.
 *
 * Deliberately reads WHO to verify from the request's own Sharetribe auth cookie (via the
 * regular getSdk) rather than trusting a userId/email the client could send in the body - that
 * way this endpoint can only ever verify the account the caller is already logged in as.
 *
 * Fully non-fatal by design: if Integration API credentials aren't configured yet
 * (getIntegrationSdk() returns null), or the call fails for any reason, this just responds
 * accordingly and the account is left exactly as it already was post-signup - fully usable,
 * with Sharetribe's own verification email still sitting in the inbox as a fallback.
 */
const { getSdk } = require('../api-util/sdk');
const { getIntegrationSdk, integrationSdkTypes } = require('../api-util/integrationSdk');
const log = require('../log');

module.exports = (req, res) => {
  const integrationSdk = getIntegrationSdk();

  if (!integrationSdk) {
    res.status(200).json({ verified: false, reason: 'integration_api_not_configured' }).end();
    return;
  }

  const sdk = getSdk(req, res);

  sdk.currentUser
    .show()
    .then(response => {
      const currentUser = response?.data?.data;
      const userId = currentUser?.id?.uuid;
      const email = currentUser?.attributes?.email;

      if (!userId || !email) {
        throw new Error('No authenticated current user with an email to verify.');
      }

      return integrationSdk.users.verifyEmail({
        id: new integrationSdkTypes.UUID(userId),
        email,
      });
    })
    .then(() => {
      res.status(200).json({ verified: true }).end();
    })
    .catch(e => {
      // Non-fatal: log it for visibility, but the account is already fully usable regardless of
      // this call's outcome, so this never surfaces as an error to the person signing up.
      log.error(e, 'auto-verify-email-failed');
      res.status(200).json({ verified: false, reason: 'verification_call_failed' }).end();
    });
};
