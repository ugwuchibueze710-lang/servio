/**
 * server/api-util/integrationSdk.js
 *
 * A separate SDK instance for Sharetribe's Integration API - distinct from the regular
 * Marketplace API SDK in server/api-util/sdk.js. The Integration API uses its own application
 * (its own Client ID/Secret, created in Sharetribe Console under Advanced > Applications), not
 * the marketplace app's normal SDK credentials, and talks to a different base URL
 * (flex-integ-api.sharetribe.com instead of flex-api.sharetribe.com).
 *
 * Right now this is used for exactly one thing: marking a brand new signup's email as verified
 * immediately (see server/api/auto-verify-email.js), so nobody has to wait on or click the
 * verification email Sharetribe sends automatically on signup. That's the only reason this
 * exists - it is not a general-purpose admin/integration layer.
 *
 * IMPORTANT: this feature is entirely optional. If SHARETRIBE_INTEGRATION_CLIENT_ID /
 * SHARETRIBE_INTEGRATION_CLIENT_SECRET aren't set, getIntegrationSdk() returns null and the
 * caller just skips auto-verification - signup and login keep working exactly as before,
 * Sharetribe's own verification email remains the fallback. This is deliberately NOT added to
 * server/index.js's MANDATORY_ENV_VARIABLES for that reason.
 */
const flexIntegrationSdk = require('sharetribe-flex-integration-sdk');

const CLIENT_ID = process.env.SHARETRIBE_INTEGRATION_CLIENT_ID;
const CLIENT_SECRET = process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;

let cachedInstance = null;

/**
 * @returns {Object|null} a shared Integration SDK instance, or null if the (optional) Integration
 *   API credentials haven't been configured yet.
 */
exports.getIntegrationSdk = () => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return null;
  }
  if (!cachedInstance) {
    cachedInstance = flexIntegrationSdk.createInstance({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    });
  }
  return cachedInstance;
};

exports.integrationSdkTypes = flexIntegrationSdk.types;
