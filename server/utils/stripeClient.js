/**
 * server/utils/stripeClient.js
 *
 * Lazy Stripe client - same "tolerant of the key being unset" pattern as server/db/mongoose.js
 * and server/utils/jwt.js, so the rest of the app (and the still-live Sharetribe checkout, while
 * it exists) keeps working even before STRIPE_SECRET_KEY is configured. Every payment route
 * checks getStripeClient() for null and returns a clear 503 instead of throwing.
 */
const Stripe = require('stripe');

let client = null;

const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }
  if (!client) {
    client = new Stripe(key, { apiVersion: '2024-06-20' });
  }
  return client;
};

module.exports = { getStripeClient };
