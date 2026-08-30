/**
 * This file contains server side endpoints that can be used to perform backend
 * tasks that can not be handled in the browser.
 *
 * The endpoints should not clash with the application routes. Therefore, the
 * endpoints are prefixed in the main server where this file is used.
 */

const express = require('express');
const bodyParser = require('body-parser');
const { deserialize } = require('./api-util/sdk');

const initiateLoginAs = require('./api/initiate-login-as');
const loginAs = require('./api/login-as');
const transactionLineItems = require('./api/transaction-line-items');
const initiatePrivileged = require('./api/initiate-privileged');
const transitionPrivileged = require('./api/transition-privileged');
// Ride-specific privileged endpoints - deliberately separate files from
// the two above (see server/api/ride-initiate-privileged.js for why).
const rideInitiatePrivileged = require('./api/ride-initiate-privileged');
const rideTransitionPrivileged = require('./api/ride-transition-privileged');
const deleteAccount = require('./api/delete-account');
const invoicePdf = require('./api/invoice-pdf');
// New custom-backend (MongoDB) endpoints - see MIGRATION_PLAN.md. Namespaced under /v2 to
// stay clearly separate from the legacy Sharetribe-era endpoints above during the migration.
const categoriesV2 = require('./api/v2/categories');
const authSignupV2 = require('./api/v2/auth/signup');
const authLoginV2 = require('./api/v2/auth/login');
const authMeV2 = require('./api/v2/auth/me');
const authBridgeV2 = require('./api/v2/auth/bridge');
const { requireAuth } = require('./middleware/authenticate');
const providersUpsertMeV2 = require('./api/v2/providers/upsertMe');
const providersGetMeV2 = require('./api/v2/providers/getMe');
const searchProvidersV2 = require('./api/v2/search/providers');
const bookingsCreateV2 = require('./api/v2/bookings/create');
const bookingsListMineV2 = require('./api/v2/bookings/listMine');
const bookingsListInboxV2 = require('./api/v2/bookings/listInbox');
const bookingsRespondV2 = require('./api/v2/bookings/respond');
const bookingsUpdateStatusV2 = require('./api/v2/bookings/updateStatus');
const driversUpsertMeV2 = require('./api/v2/drivers/upsertMe');
const driversGetMeV2 = require('./api/v2/drivers/getMe');
const driversSetStatusV2 = require('./api/v2/drivers/setStatus');
const ridesCreateV2 = require('./api/v2/rides/create');
const ridesGetOneV2 = require('./api/v2/rides/getOne');
const ridesListCandidatesV2 = require('./api/v2/rides/listCandidates');
const ridesDriverRespondV2 = require('./api/v2/rides/driverRespond');
const ridesCancelV2 = require('./api/v2/rides/cancel');
const paymentsCreateBookingIntentV2 = require('./api/v2/payments/createBookingIntent');
const paymentsCreateRideIntentV2 = require('./api/v2/payments/createRideIntent');
const paymentsWebhookV2 = require('./api/v2/payments/webhook');
const reviewsCreateBookingV2 = require('./api/v2/reviews/createBookingReview');
const reviewsCreateRideV2 = require('./api/v2/reviews/createRideReview');
const reviewsListForBusinessV2 = require('./api/v2/reviews/listForBusiness');
const reviewsListForDriverV2 = require('./api/v2/reviews/listForDriver');
const requireAdmin = require('./middleware/requireAdmin');
const adminCategoriesListV2 = require('./api/v2/admin/categories/list');
const adminCategoriesCreateV2 = require('./api/v2/admin/categories/create');
const adminCategoriesUpdateV2 = require('./api/v2/admin/categories/update');
const adminCategoriesDeactivateV2 = require('./api/v2/admin/categories/deactivate');
const adminUsersListV2 = require('./api/v2/admin/users/list');
const adminUsersSetActiveV2 = require('./api/v2/admin/users/setActive');
const adminBusinessesListV2 = require('./api/v2/admin/businesses/list');
const adminBusinessesModerateV2 = require('./api/v2/admin/businesses/moderate');
const adminDriversListV2 = require('./api/v2/admin/drivers/list');
const adminDriversModerateV2 = require('./api/v2/admin/drivers/moderate');

const createUserWithIdp = require('./api/auth/createUserWithIdp');

const { authenticateFacebook, authenticateFacebookCallback } = require('./api/auth/facebook');
const { authenticateGoogle, authenticateGoogleCallback } = require('./api/auth/google');

const router = express.Router();

// New /v2 endpoints (server/api/v2/*) take plain JSON bodies, unlike the legacy Transit-based
// endpoints above - scope express.json() to just that path prefix so nothing else changes.
// Stripe's webhook signature check needs the raw request body, not JSON-parsed - this route
// is registered (with its own express.raw() parser) BEFORE the general /v2 JSON body parser
// below, so it never gets its body pre-parsed. See MIGRATION_PLAN.md Phase 6.
router.post('/v2/payments/webhook', express.raw({ type: 'application/json' }), paymentsWebhookV2);

router.use('/v2', express.json());

// ================ API router middleware: ================ //

// Parse Transit body first to a string
router.use(
  bodyParser.text({
    type: 'application/transit+json',
  })
);

// Deserialize Transit body string to JS data
router.use((req, res, next) => {
  if (req.get('Content-Type') === 'application/transit+json' && typeof req.body === 'string') {
    try {
      req.body = deserialize(req.body);
    } catch (e) {
      console.error('Failed to parse request body as Transit:');
      console.error(e);
      res.status(400).send('Invalid Transit in request body.');
      return;
    }
  }
  next();
});

// ================ API router endpoints: ================ //

router.get('/initiate-login-as', initiateLoginAs);
router.get('/login-as', loginAs);
router.post('/transaction-line-items', transactionLineItems);
router.post('/initiate-privileged', initiatePrivileged);
router.post('/transition-privileged', transitionPrivileged);
router.post('/ride/initiate-privileged', rideInitiatePrivileged);
router.post('/ride/transition-privileged', rideTransitionPrivileged);
router.post('/delete-account', deleteAccount);

// Optional, on-demand invoice/receipt PDF for a completed transaction (self-contained - see
// server/api/invoice-pdf.js and server/invoice/*). Either party to the transaction can request it.
router.get('/invoice-pdf/:transactionId', invoicePdf);

// Phase 1 of the Sharetribe migration (see MIGRATION_PLAN.md): public, database-driven category
// list. Returns 503 with a clear message if MONGODB_URI isn't configured yet.
router.get('/v2/categories', categoriesV2);

// Phase 2 of the Sharetribe migration (see MIGRATION_PLAN.md): JWT-based auth on the new AppUser
// model. Lives alongside (does not yet replace) Sharetribe's own login/signup.
router.post('/v2/auth/signup', authSignupV2);
router.post('/v2/auth/login', authLoginV2);
router.get('/v2/auth/me', requireAuth, authMeV2);
// No requireAuth here by design - the caller doesn't have an AppUser JWT yet. This endpoint
// authenticates via the Sharetribe session cookie instead (same pattern as
// ride-initiate-privileged.js / delete-account.js) and hands back a JWT once it's verified who
// is really asking. See server/api/v2/auth/bridge.js for the full rationale.
router.post('/v2/auth/bridge', authBridgeV2);

// Phase 3 of the Sharetribe migration (see MIGRATION_PLAN.md): real provider profiles and
// geospatial search. Search is public; creating/editing your own profile requires auth.
router.post('/v2/providers/me', requireAuth, providersUpsertMeV2);
router.get('/v2/providers/me', requireAuth, providersGetMeV2);
router.get('/v2/search/providers', searchProvidersV2);

// Phase 4 of the Sharetribe migration (see MIGRATION_PLAN.md): the real booking lifecycle -
// customer requests, provider inbox, accept/decline, and status tracking through to completion.
router.post('/v2/bookings', requireAuth, bookingsCreateV2);
router.get('/v2/bookings/mine', requireAuth, bookingsListMineV2);
router.get('/v2/bookings/inbox', requireAuth, bookingsListInboxV2);
router.post('/v2/bookings/:id/respond', requireAuth, bookingsRespondV2);
router.post('/v2/bookings/:id/status', requireAuth, bookingsUpdateStatusV2);

// Phase 5 of the Sharetribe migration (see MIGRATION_PLAN.md): driver onboarding, the
// online/offline toggle, and real ride matching (geospatial nearby-driver search + an atomic
// accept so two drivers can't both win the same ride). Polling-based for now - Socket.IO push
// events are part of the Phase 9 frontend rewire.
router.post('/v2/drivers/me', requireAuth, driversUpsertMeV2);
router.get('/v2/drivers/me', requireAuth, driversGetMeV2);
router.post('/v2/drivers/me/status', requireAuth, driversSetStatusV2);
router.post('/v2/rides', requireAuth, ridesCreateV2);
router.get('/v2/rides/candidates/mine', requireAuth, ridesListCandidatesV2);
router.get('/v2/rides/:id', requireAuth, ridesGetOneV2);
router.post('/v2/rides/:id/driver-respond', requireAuth, ridesDriverRespondV2);
router.post('/v2/rides/:id/cancel', requireAuth, ridesCancelV2);

// Phase 6 of the Sharetribe migration (see MIGRATION_PLAN.md): real Stripe payments for both
// bookings and rides, sharing one integration. The webhook (registered above, pre-JSON-parser)
// is the actual source of truth for paymentStatus - these two only create the PaymentIntent.
router.post('/v2/payments/bookings/:id/intent', requireAuth, paymentsCreateBookingIntentV2);
router.post('/v2/payments/rides/:id/intent', requireAuth, paymentsCreateRideIntentV2);

// Phase 7 of the Sharetribe migration (see MIGRATION_PLAN.md): reviews tied only to
// completed bookings/rides - the completed-status check happens server-side, never trusted
// from the client, and ratingAvg/ratingCount are recomputed from the real review set every time.
router.post('/v2/reviews/bookings/:id', requireAuth, reviewsCreateBookingV2);
router.post('/v2/reviews/rides/:id', requireAuth, reviewsCreateRideV2);
router.get('/v2/reviews/business/:businessId', reviewsListForBusinessV2);
router.get('/v2/reviews/driver/:driverId', reviewsListForDriverV2);

// Phase 8 of the Sharetribe migration (see MIGRATION_PLAN.md): admin CRUD. Every route below
// requires requireAuth AND requireAdmin - requireAdmin checks the real isAdmin flag on the
// loaded account, which no API endpoint can ever set (see server/middleware/requireAdmin.js
// and server/scripts/makeAdmin.js).
router.get('/v2/admin/categories', requireAuth, requireAdmin, adminCategoriesListV2);
router.post('/v2/admin/categories', requireAuth, requireAdmin, adminCategoriesCreateV2);
router.patch('/v2/admin/categories/:id', requireAuth, requireAdmin, adminCategoriesUpdateV2);
router.delete('/v2/admin/categories/:id', requireAuth, requireAdmin, adminCategoriesDeactivateV2);
router.get('/v2/admin/users', requireAuth, requireAdmin, adminUsersListV2);
router.patch('/v2/admin/users/:id/active', requireAuth, requireAdmin, adminUsersSetActiveV2);
router.get('/v2/admin/businesses', requireAuth, requireAdmin, adminBusinessesListV2);
router.patch('/v2/admin/businesses/:id', requireAuth, requireAdmin, adminBusinessesModerateV2);
router.get('/v2/admin/drivers', requireAuth, requireAdmin, adminDriversListV2);
router.patch('/v2/admin/drivers/:id', requireAuth, requireAdmin, adminDriversModerateV2);

// Create user with identity provider (e.g. Facebook or Google)
// This endpoint is called to create a new user after user has confirmed
// they want to continue with the data fetched from IdP (e.g. name and email)
router.post('/auth/create-user-with-idp', createUserWithIdp);

// Facebook authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Facebook
router.get('/auth/facebook', authenticateFacebook);

// This is the route for callback URL the user is redirected after authenticating
// with Facebook. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/facebook/callback', authenticateFacebookCallback);

// Google authentication endpoints

// This endpoint is called when user wants to initiate authenticaiton with Google
router.get('/auth/google', authenticateGoogle);

// This is the route for callback URL the user is redirected after authenticating
// with Google. In this route a Passport.js custom callback is used for calling
// loginWithIdp endpoint in Sharetribe Auth API to authenticate user to the marketplace
router.get('/auth/google/callback', authenticateGoogleCallback);

module.exports = router;
