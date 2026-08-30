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
// Best-effort auto-verification for brand new Sharetribe signups - see
// server/api/auto-verify-email.js and server/api-util/integrationSdk.js for why this exists and
// why it never blocks or breaks signup if it's not configured or fails.
const autoVerifyEmail = require('./api/auto-verify-email');
// New custom-backend (MongoDB) endpoints - see MIGRATION_PLAN.md. Namespaced under /v2 to
// stay clearly separate from the legacy Sharetribe-era endpoints above during the migration.
const categoriesV2 = require('./api/v2/categories');
const authSignupV2 = require('./api/v2/auth/signup');
const authLoginV2 = require('./api/v2/auth/login');
const authMeV2 = require('./api/v2/auth/me');
const authBridgeV2 = require('./api/v2/auth/bridge');
const { requireAuth, optionalAuth } = require('./middleware/authenticate');
const providersUpsertMeV2 = require('./api/v2/providers/upsertMe');
const providersGetMeV2 = require('./api/v2/providers/getMe');
const providersSetAcceptingJobsV2 = require('./api/v2/providers/setAcceptingJobs');
const providersGetOneV2 = require('./api/v2/providers/getOne');
const searchProvidersV2 = require('./api/v2/search/providers');
const bookingsCreateV2 = require('./api/v2/bookings/create');
const bookingsListMineV2 = require('./api/v2/bookings/listMine');
const bookingsListInboxV2 = require('./api/v2/bookings/listInbox');
const bookingsGetOneV2 = require('./api/v2/bookings/getOne');
const bookingsRespondV2 = require('./api/v2/bookings/respond');
const bookingsUpdateStatusV2 = require('./api/v2/bookings/updateStatus');
const messagesSendV2 = require('./api/v2/messages/send');
const messagesListV2 = require('./api/v2/messages/list');
const bookingsConfirmV2 = require('./api/v2/bookings/confirm');
const bookingsDisputeV2 = require('./api/v2/bookings/dispute');
const bookingsDisputeRespondV2 = require('./api/v2/bookings/disputeRespond');
const adminResolveDisputeV2 = require('./api/v2/admin/bookings/resolveDispute');
const notificationsListV2 = require('./api/v2/notifications/list');
const notificationsMarkReadV2 = require('./api/v2/notifications/markRead');
const meUpdateLocationV2 = require('./api/v2/me/updateLocation');
const meSetModeV2 = require('./api/v2/me/setMode');
const savedProvidersAddV2 = require('./api/v2/me/savedProviders/add');
const savedProvidersRemoveV2 = require('./api/v2/me/savedProviders/remove');
const savedProvidersListV2 = require('./api/v2/me/savedProviders/list');
const uploadsCreateV2 = require('./api/v2/uploads/create');
const uploadsGetV2 = require('./api/v2/uploads/get');
const uploadsDeleteV2 = require('./api/v2/uploads/deleteFile');
const upload = require('./middleware/upload');
const searchSmartV2 = require('./api/v2/search/smart');
const driversUpsertMeV2 = require('./api/v2/drivers/upsertMe');
const driversGetMeV2 = require('./api/v2/drivers/getMe');
const driversSetStatusV2 = require('./api/v2/drivers/setStatus');
const ridesCreateV2 = require('./api/v2/rides/create');
const ridesGetOneV2 = require('./api/v2/rides/getOne');
const ridesListCandidatesV2 = require('./api/v2/rides/listCandidates');
const ridesGetActiveMineV2 = require('./api/v2/rides/getActiveMine');
const ridesDriverRespondV2 = require('./api/v2/rides/driverRespond');
const ridesCancelV2 = require('./api/v2/rides/cancel');
const ridesUpdateStatusV2 = require('./api/v2/rides/updateStatus');
const driversUpdateLocationV2 = require('./api/v2/drivers/updateLocation');
const paymentsCreateBookingIntentV2 = require('./api/v2/payments/createBookingIntent');
const paymentsCreateRideIntentV2 = require('./api/v2/payments/createRideIntent');
const paymentsConnectOnboardV2 = require('./api/v2/payments/connectOnboard');
const paymentsConnectStatusV2 = require('./api/v2/payments/connectStatus');
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
router.post('/auto-verify-email', autoVerifyEmail);

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
// Real signup/login (email + password, bcrypt-backed AppUser accounts) are registered above -
// authSignupV2/authLoginV2. The old in-memory "tester" auth stack and passwordless test-signup
// shim have been removed: they were explicitly throwaway/fake sign-in paths, which contradicts
// this app's real-functionality-only requirement. See AuthenticationPageV2.js for the real UI.

// Phase 3 of the Sharetribe migration (see MIGRATION_PLAN.md): real provider profiles and
// geospatial search. Search is public; creating/editing your own profile requires auth.
router.post('/v2/providers/me', requireAuth, providersUpsertMeV2);
router.get('/v2/providers/me', requireAuth, providersGetMeV2);
router.patch('/v2/providers/me/accepting-jobs', requireAuth, providersSetAcceptingJobsV2);
router.get('/v2/providers/:id', optionalAuth, providersGetOneV2);
router.get('/v2/search/providers', searchProvidersV2);

// Phase 4 of the Sharetribe migration (see MIGRATION_PLAN.md): the real booking lifecycle -
// customer requests, provider inbox, accept/decline, and status tracking through to completion.
router.post('/v2/bookings', requireAuth, bookingsCreateV2);
router.get('/v2/bookings/mine', requireAuth, bookingsListMineV2);
router.get('/v2/bookings/inbox', requireAuth, bookingsListInboxV2);
router.get('/v2/bookings/:id', requireAuth, bookingsGetOneV2);
router.post('/v2/bookings/:id/respond', requireAuth, bookingsRespondV2);
router.post('/v2/bookings/:id/status', requireAuth, bookingsUpdateStatusV2);
// Real, persisted messaging tied to one booking (Project Passport) - see server/models/Message.js.
router.post('/v2/bookings/:id/messages', requireAuth, messagesSendV2);
router.get('/v2/bookings/:id/messages', requireAuth, messagesListV2);
// Job-completion confirm/dispute (spec section 33/34) - separate from the generic
// updateStatus.js because each needs extra logic (payout release, dispute reason).
router.post('/v2/bookings/:id/confirm', requireAuth, bookingsConfirmV2);
router.post('/v2/bookings/:id/dispute', requireAuth, bookingsDisputeV2);
router.post('/v2/bookings/:id/dispute/respond', requireAuth, bookingsDisputeRespondV2);
router.patch('/v2/admin/bookings/:id/resolve-dispute', requireAuth, requireAdmin, adminResolveDisputeV2);

// Real, persisted notifications (spec section 40).
router.get('/v2/notifications', requireAuth, notificationsListV2);
router.patch('/v2/notifications/:id/read', requireAuth, notificationsMarkReadV2);

// Real, persisted customer location preference (spec sections 6-8) - label/coordinates/radius/
// locked, always Mapbox-resolved coordinates, never raw text alone.
router.patch('/v2/me/location', requireAuth, meUpdateLocationV2);
router.patch('/v2/me/mode', requireAuth, meSetModeV2);

// Real saved/favorite providers (spec section 21).
router.get('/v2/me/saved-providers', requireAuth, savedProvidersListV2);
router.post('/v2/me/saved-providers/:businessId', requireAuth, savedProvidersAddV2);
router.delete('/v2/me/saved-providers/:businessId', requireAuth, savedProvidersRemoveV2);

// Real file uploads via MongoDB GridFS (spec section 38) - no extra credential needed
// beyond MONGODB_URI. Public purposes (profile/portfolio images) are servable to anyone;
// private purposes (project photos, completion evidence) are authorization-checked in
// uploadsGetV2 itself.
router.post('/v2/uploads', requireAuth, upload.single('file'), uploadsCreateV2);
router.get('/v2/uploads/:id', optionalAuth, uploadsGetV2);
router.delete('/v2/uploads/:id', requireAuth, uploadsDeleteV2);

// Groq-powered smart search (optional auth: works signed-out, persists history when signed in).
router.post('/v2/search/smart', optionalAuth, searchSmartV2);

// Phase 5 of the Sharetribe migration (see MIGRATION_PLAN.md): driver onboarding, the
// online/offline toggle, and real ride matching (geospatial nearby-driver search + an atomic
// accept so two drivers can't both win the same ride). Polling-based for now - Socket.IO push
// events are part of the Phase 9 frontend rewire.
router.post('/v2/drivers/me', requireAuth, driversUpsertMeV2);
router.get('/v2/drivers/me', requireAuth, driversGetMeV2);
router.post('/v2/drivers/me/status', requireAuth, driversSetStatusV2);
router.post('/v2/rides', requireAuth, ridesCreateV2);
router.get('/v2/rides/candidates/mine', requireAuth, ridesListCandidatesV2);
// A driver's own currently-assigned ride, if any - lets their app recover state after a
// reload instead of only ever learning about a ride at the moment it's offered.
router.get('/v2/rides/active/mine', requireAuth, ridesGetActiveMineV2);
router.get('/v2/rides/:id', requireAuth, ridesGetOneV2);
router.post('/v2/rides/:id/driver-respond', requireAuth, ridesDriverRespondV2);
router.post('/v2/rides/:id/cancel', requireAuth, ridesCancelV2);
// Driver-only forward lifecycle (driver_assigned -> ... -> trip_completed) - see
// server/utils/rideStateMachine.js. Recomputes the real final fare server-side on completion.
router.post('/v2/rides/:id/status', requireAuth, ridesUpdateStatusV2);
// Throttled location ping while online (idle or mid-trip) - what getOne.js's driverLocation
// and the eventual rider map read from.
router.patch('/v2/drivers/me/location', requireAuth, driversUpdateLocationV2);

// Phase 6 of the Sharetribe migration (see MIGRATION_PLAN.md): real Stripe payments for both
// bookings and rides, sharing one integration. The webhook (registered above, pre-JSON-parser)
// is the actual source of truth for paymentStatus - these two only create the PaymentIntent.
router.post('/v2/payments/bookings/:id/intent', requireAuth, paymentsCreateBookingIntentV2);
router.post('/v2/payments/rides/:id/intent', requireAuth, paymentsCreateRideIntentV2);
// Stripe Connect onboarding for providers (spec section 32) - account creation + a real
// Stripe-hosted onboarding link, and a status check re-synced from Stripe on every call.
router.post('/v2/payments/connect/onboard', requireAuth, paymentsConnectOnboardV2);
router.get('/v2/payments/connect/status', requireAuth, paymentsConnectStatusV2);

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
