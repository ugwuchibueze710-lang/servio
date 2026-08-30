# Servio: migration off Sharetribe - status and plan

This documents the in-progress migration from Sharetribe Flex (the current backend for auth,
listings, transactions, and payments) to a custom Express + MongoDB backend, per the decision to
fully own the marketplace/ride-hailing engine instead of building on Sharetribe.

Reference architectures inspected: `Sachinrajawat/FixItNow` (Express + TypeScript + MongoDB +
Redis service-marketplace API - its controller/route/model organization and Mongoose schema
patterns are what `server/models/*.js` and `server/api/v2/*.js` here follow) and
`YKizou/Uber-Clone` (a frontend-only Next.js + Mapbox + Turf demo with no real backend - useful
only as a UI/interaction reference; Servio's own `RidePage.js` already implements real Mapbox
geocoding, routing, and fare estimation at or beyond that reference's level, so it is being kept
and rewired rather than replaced).

## Why this is staged, not a single rewrite

Sharetribe's SDK and API are threaded through most of the app: every `*.duck.js` file that touches
auth, listings, transactions, or payments; every container that reads `currentUser` or a listing
entity; the checkout/payment flow; the provider inbox; search. Ripping all of that out at once
before the replacement is built and tested would take the live site down for the length of the
whole migration. Instead, each phase below ships one complete, real, working vertical slice
(UI -> API -> database -> real response, per the "no fake functionality" rule) alongside the
still-working Sharetribe-backed features, until enough phases are done to remove Sharetribe
entirely.

## Phases

- **Phase 1 - DONE (this change).** New backend foundation: MongoDB connection (`server/db/mongoose.js`),
  Mongoose models for `Category`, `AppUser`, `Business`, `Booking`, `Review`, `Driver`, `Vehicle`,
  `RideRequest` (`server/models/`), a seed script for the real 21 categories
  (`server/scripts/seedCategories.js`), and the first live endpoint, `GET /api/v2/categories`,
  mounted in `server/apiRouter.js`. The homepage's `CategoryHero` component now fetches from this
  endpoint (falling back to the old static list if the database isn't reachable yet, so the
  homepage never breaks). **Only `Category` is fully wired end-to-end right now** - the other
  models exist so later phases have a foundation, but nothing reads/writes them yet.
- **Phase 2 - DONE (this change).** Real JWT-based auth on `AppUser`: `POST /api/v2/auth/signup`,
  `POST /api/v2/auth/login` (bcrypt-hashed passwords, generic "incorrect email or password" on
  both a wrong password and an unknown email so login can't be used to enumerate accounts), and
  `GET /api/v2/auth/me` (guarded by `server/middleware/authenticate.js`'s `requireAuth`, which
  re-reads the account from the database on every call rather than trusting the token alone, so a
  deactivated/deleted account is rejected immediately). All three were exercised with an
  automated test (real bcrypt + JWT round trips, real handler code) covering signup, duplicate
  email, weak password, correct/incorrect login, unknown-email login, and missing/invalid/valid
  tokens on `/me` - see "How Phase 2 was tested" below. **The frontend still uses Sharetribe's own
  login/signup** (`AuthenticationPage.duck.js`); wiring the UI to these new endpoints - and
  merging "one account, multiple roles" (section 18) into a single signup flow - is Phase 9
  (Frontend rewire), once Phase 3+ give roles something to actually do.
- **Phase 3 - DONE (this change).** Real provider profiles and search: `POST /api/v2/providers/me`
  (create/update your own `Business` profile - validates category slugs against the real
  `Category` collection, generates a unique slug with a real collision-retry loop, and adds
  `'provider'` to the account's `roles` on first use), `GET /api/v2/providers/me` (your own
  profile, or `business: null` if you haven't made one - not fake placeholder data), and the
  customer-facing `GET /api/v2/search/providers?category=<slug>&lat=&lng=&radiusMiles=` - a real
  `$geoNear`/2dsphere query when a location is given, real category-filtered + rating-sorted list
  otherwise, and a genuine empty `data: []` (never fake providers) when nobody has registered in
  that category yet. An unknown category slug is a real 404, not a silently-empty 200. 15
  automated checks covered profile creation/validation/uniqueness and all three empty vs.
  populated search states - see "How Phase 2 was tested" below (same method, same caveat about
  this sandbox's MongoDB access). **A parallel, unlinked frontend for this now exists** -
  `/provider-profile-v2` (create/edit) and `/providers-v2/:categorySlug` (public search) - see
  the "Phase 9 - Provider profile + search frontend built" entry below for what it does and what
  it doesn't. Category tiles on the homepage still route to Sharetribe's own `SearchPage`
  (`pub_categoryLevel1` filter against Sharetribe listings); swapping that live path over to
  this one, and linking these new routes from anywhere in the UI, is still deferred Phase 9 work
  until there's been a real end-to-end run against a live database.
- **Phase 4 - DONE (this change).** The real booking lifecycle, enforced by
  `server/utils/bookingStateMachine.js` rather than trusting whatever status the client sends:
  `POST /api/v2/bookings` (a customer's request - rejected if the business doesn't exist, is
  inactive, or doesn't actually offer the requested category), `GET /api/v2/bookings/mine`
  (customer's own list), `GET /api/v2/bookings/inbox` (provider's inbox across all their
  businesses - an honest empty list with a clear reason if they have no provider profile yet),
  `POST /api/v2/bookings/:id/respond` (accept/decline - only the actual business owner can do
  this, checked against the real `Business.owner`, not just "any logged-in provider"), and
  `POST /api/v2/bookings/:id/status` (scheduled -> in_progress -> completed, provider-only;
  cancellation, either party, from any non-terminal state). 16 automated checks covered
  category/business validation, cross-account authorization (a non-owner can't see or act on
  someone else's booking), the full accept -> scheduled -> in_progress -> completed happy path,
  rejecting an already-handled or terminal-state transition, and a customer cancelling their own
  still-open request - see "How Phase 2 was tested" below for the method/caveat. **A parallel,
  unlinked frontend for this now exists too** - `/book-v2/:businessId`, `/my-bookings-v2`, and
  `/provider-inbox-v2` - see the "Phase 9 - Booking request/inbox frontend built" entry below.
- **Phase 5 - DONE for matching, POLLING not push (this change).** Driver onboarding
  (`POST /api/v2/drivers/me` writes a real `Driver` + `Vehicle` together - you can't go online
  without both) and the online/offline toggle (`POST /api/v2/drivers/me/status` - refuses to go
  online without a registered vehicle or without a current location, since matching depends on
  both). Ride requests (`POST /api/v2/rides`) run real matching immediately: a genuine
  `$near`/2dsphere query against currently-online drivers within 10 miles of pickup:
  either real candidates and a `searching` status, or a real, honest `no_drivers_found` - the
  "No drivers found nearby yet" behavior from the very first ask about this feature. Drivers see
  their pending requests via `GET /api/v2/rides/candidates/mine` and respond via
  `POST /api/v2/rides/:id/driver-respond` - acceptance is one atomic database update keyed on the
  ride still being `searching` and that driver's candidate slot still being `pending`, so two
  drivers racing to accept the same ride can never both win (verified with an actual concurrent
  race in the test, not just sequential calls) - and once every candidate has declined, the ride
  honestly moves to `no_drivers_found` instead of sitting in limbo. `POST /api/v2/rides/:id/cancel`
  lets the customer back out any time before a trip starts. 13 automated checks covered all of
  this, including the real concurrent-accept race - see "How Phase 2 was tested" below.
  **Deliberately NOT done in this pass: Socket.IO / real-time push, and rewiring
  `RidePage.js`/`DriverRidePage.js`.** Right now this is a poll-based API only - a driver's app
  would need to poll `candidates/mine` and a customer's app would poll `GET /api/v2/rides/:id` for
  status changes. Real-time push and swapping Servio's existing (already-real, Mapbox-based)
  `RidePage.js`/`DriverRidePage.js` over to call this API instead of Sharetribe's `ride`
  transaction process both belong in Phase 9, once the frontend rewire is happening as one
  deliberate pass rather than three separate half-migrated ride screens.
- **Phase 6 - DONE for Payment Intents, Connect payouts NOT done (this change).** Real Stripe
  payments, shared by both bookings and rides: `POST /api/v2/payments/bookings/:id/intent` (only
  once a booking is actually accepted with a real quoted price - rejects an unaccepted booking,
  an already-paid one, or someone paying for a booking that isn't theirs; reuses an existing
  still-open PaymentIntent instead of creating a duplicate charge attempt on every retry) and the
  ride equivalent, `POST /api/v2/payments/rides/:id/intent` (only once a ride has actually
  completed, charging the real final fare). Critically, **the webhook
  (`POST /api/v2/payments/webhook`) - not the client confirming a card - is what actually flips
  `paymentStatus` to `'paid'`**, verified against `STRIPE_WEBHOOK_SECRET` using Stripe's real
  signature check; a forged or malformed webhook is rejected with a 400, never trusted. 14
  automated checks covered all of this, including a genuine bad-signature rejection and
  confirming the database itself (not just the response) reflects `paid`/`failed` after a webhook
  - see "How Phase 2 was tested" below. **Not done: Stripe Connect for provider/driver payouts**
  (section 15-17 also calls for actually paying providers and drivers out, not just collecting
  from customers) - that's a separate, larger integration (Connect account onboarding, payout
  scheduling) deferred to when there's a real provider/driver base to pay out to. Also not yet
  wired to any frontend checkout screen - same Phase 9 reasoning as the rest.
- **Phase 7 - DONE (this change).** Reviews tied only to completed transactions - the actual
  point of spec section 20, not just a schema field: `POST /api/v2/reviews/bookings/:id` and
  `POST /api/v2/reviews/rides/:id` both re-check server-side that the transaction is really
  `completed`/`trip_completed` and belongs to the reviewing customer, and both reject a second
  review of the same transaction. `Business.ratingAvg`/`ratingCount` and `Driver.ratingAvg`/
  `ratingCount` are recomputed from the real review documents after every write (a MongoDB
  aggregate, not a hand-incremented counter that could drift), and `GET /api/v2/reviews/business/
  :businessId` / `GET /api/v2/reviews/driver/:driverId` are real, honestly-empty-until-reviewed
  public lists. 11 automated checks covered all of this, including that a second review produces
  a genuinely recomputed average rather than a hardcoded number - see "How Phase 2 was tested"
  below.
- **Phase 8 - DONE for categories/users/providers/drivers (this change).** Real admin CRUD,
  gated by a new `AppUser.isAdmin` flag that **no API endpoint can ever set** - the only way to
  create the first admin (or add another) is `node server/scripts/makeAdmin.js you@example.com`
  with direct database access, the same pattern as `seedCategories.js`, so there is no
  self-escalation path through the API. `/api/v2/admin/categories` (list/create/update/soft-delete
  - this is what replaces manually re-running `seedCategories.js` going forward), `/api/v2/admin/
  users` (search + suspend, with a real guard stopping an admin from locking themselves out),
  `/api/v2/admin/businesses` and `/api/v2/admin/drivers` (list + moderate - deactivating a driver
  also force-takes them offline so a suspended driver can't keep receiving ride requests). 14
  automated checks covered all of it, including the non-admin-refused check, the self-lockout
  guard, and the deactivate-forces-offline behavior - see "How Phase 2 was tested" below. **Not
  done: admin views for bookings/rides** (oversight/dispute-resolution listing) - lower priority
  than the account/category/provider/driver management that exists now, left for a later pass.
- **Important correction found while starting Phase 9, and the decision that came out of it.**
  Before writing any frontend-rewire code, this project's own rule ("inspect before modifying")
  meant actually reading how Ride works today before touching `RidePage.js`/`DriverRidePage.js`.
  That reading turned up something the Phase 5 write-up above didn't know when it was written:
  Ride already has a real, working, live implementation - built entirely on Sharetribe, not a
  gap that needed filling. `RIDE_INTEGRATION_REPORT.md` documents why (Sharetribe Flex has no
  arbitrary custom database tables, so Ride was built as a Sharetribe transaction process, with
  drivers as Sharetribe listings, pricing as a Console-managed asset, and throttled-polling
  location tracking). `server/api/ride-initiate-privileged.js` and `server/api-util/
  rideDispatch.js` are that implementation - real Mapbox-derived inputs, real nearest-driver
  matching against live Sharetribe listings, and a genuine `409 NO_DRIVER_FOUND` when no one's
  online nearby. In other words, **Phase 5 above built a second, redundant matching system**
  rather than filling an actual gap.
  
  I stopped and asked rather than either quietly overwriting the working Sharetribe version or
  quietly abandoning Phase 5. The decision: **migrate Ride to the new backend anyway** - Phase
  5's MongoDB-based driver/ride matching becomes the real system of record for Ride, and the
  Sharetribe-based implementation gets retired once the new one is wired up and tested. This is
  knowingly the riskier path (replacing something real and live, not filling a gap), so it's
  being done with the extra care that implies - one verified piece at a time, same as every
  phase before it.
- **Phase 9 prerequisite - DONE: Sharetribe-to-AppUser auth bridge (this change).** Every
  `/api/v2` endpoint from Phase 2 onward requires a Phase-2 JWT tied to an `AppUser` document -
  but someone browsing the live site right now is authenticated as a *Sharetribe* user (a
  session cookie), with no such JWT and usually no `AppUser` yet. `POST /api/v2/auth/bridge`
  closes that gap: it uses the same cookie-token-store + `getSdk` pattern every other privileged
  Sharetribe endpoint already relies on (`delete-account.js`, `ride-initiate-privileged.js`) to
  ask Sharetribe who is really signed in, then finds-or-creates a matching `AppUser` by email
  and returns a normal Phase-2 JWT - the same shape `signup.js`/`login.js` already return, so
  every existing `/api/v2` endpoint works unmodified once the frontend calls this first. Real
  safeguards, not just a happy path: refuses to link or create anything unless Sharetribe says
  the account's email is verified (otherwise someone could claim an email they don't own);
  reuses the same `AppUser` on every repeat call instead of creating duplicates; if bridging
  would match an email already linked to a *different* Sharetribe account id, it refuses with a
  409 instead of silently reassigning access; a brand-new `AppUser` gets an unusable random
  password hash (bcrypt of 32 random bytes) since it was never given a real password. Adds one
  new, optional, indexed field to `AppUser` (`sharetribeUserId`) - existing accounts and the
  Phase 2 signup/login flow are untouched. 10 automated checks covered all of this (no session,
  unverified email, new-account creation with a valid decodable JWT, idempotent repeat calls,
  linking an existing password-signup account without losing its roles, the conflict case, DB
  unavailable, and a malformed Sharetribe response) - see "How Phase 2 was tested" below. **Not
  done yet: actually calling this from the frontend, or the rest of the Ride rewire** - this is
  the prerequisite `RidePage.js`/`DriverRidePage.js` need before they can call `/api/v2/rides`/
  `/api/v2/drivers` at all; that rewiring is the next step.
- **Phase 9 prerequisite - DONE: full ride lifecycle + live driver location on the new backend
  (this change).** Reading `RidePage.js`/`DriverRidePage.js` in full (the actual inspection this
  correction called for) showed Phase 5's original backend was missing several things the live
  Sharetribe implementation already does, which would have made a straight frontend swap silently
  regress real functionality:
  - `POST /api/v2/rides/:id/status` - the assigned driver moving a ride through `driver_arriving
    -> driver_arrived -> trip_started -> trip_completed`, one real step at a time
    (`server/utils/rideStateMachine.js` refuses any skip), mirroring the granular lifecycle
    `DriverRidePage.duck.js` already drives today.
  - Completing a trip now requires the real, actually-driven distance/duration (the GPS-odometer
    equivalent of what `DriverRidePage.js`'s odometer hook already captures) and recomputes a
    genuine final fare from it via the new `server/utils/rideFare.js` - a numerically-identical
    port of `calculateRideFare` (the client can't submit a distance/duration that produces a
    fare and skip the recompute; a missing/negative value is a real 400, not a fallback to the
    estimate).
  - `POST /api/v2/rides` now computes `estimatedFare` server-side from the real Mapbox-derived
    distance/duration too (previously it matched drivers but never priced the ride at all).
  - Fixed a real matching bug this inspection surfaced: the original candidate query only
    checked `isOnline`, so a driver already mid-trip on one ride could be handed a second ride's
    candidate slot. `POST /api/v2/rides` now excludes any driver with an active
    (`driver_assigned`/`driver_arriving`/`driver_arrived`/`trip_started`) ride from new candidate
    pools, without touching `isOnline` itself (a driver mid-trip is still legitimately "online"
    for location-tracking purposes - see next point).
  - `PATCH /api/v2/drivers/me/location` - the throttled (~5-15s) location ping a driver's app
    sends while online, whether idle or mid-trip, refused if they're not online. `GET
    /api/v2/rides/:id` now returns the assigned driver's real current location alongside the
    ride, so a customer's map has something genuine to plot - the direct equivalent of
    `rideDriverLocationSelector` reading a Sharetribe listing's `geolocation` today.
  
  14 automated checks covered all of this (fabricated-fare rejection, real server-computed fare,
  the busy-driver exclusion, wrong-driver and skip-ahead rejections, sequential transitions, the
  trip-completion fare recompute actually differing from the estimate, location updates refused
  while offline and accepted while online, and a stranger being refused the ride entirely) - see
  "How Phase 2 was tested" below. **Known, disclosed behavior differences from the live
  Sharetribe version, kept deliberately rather than papered over:** (1) dispatch here broadcasts
  to up to 5 nearby drivers at once (Phase 5's existing, tested design) rather than the live
  version's one-at-a-time sequential retry with a 3-attempt limit - `RidePage.js`'s "try the next
  driver" retry UI will need to become a single "notifying nearby drivers" wait state once the
  frontend is rewired, not a like-for-like swap. (2) Payment happens after trip completion here
  (Phase 6), not pre-authorized before a driver is even dispatched like the live
  `PENDING_PAYMENT` step - post-paid is standard for ride-hailing apps, but it is a real change
  from what's live today. (3) Fee-tiered cancellation charges (the live version's per-state
  cancellation fee) are **not yet implemented** here - `POST /api/v2/rides/:id/cancel` still
  cancels for free from any pre-trip state; adding a real charge for it needs its own Stripe
  path and was left out of this pass rather than adding an inert fee field nothing actually
  collects. **Still not done: actually rewiring `RidePage.js`/`DriverRidePage.js`** to call any
  of this - that's the next, genuinely risky step, now that the backend it would call is at real
  functional parity (net of the three disclosed differences above) with what's live.
- **Phase 9 - Ride frontend rewire built, NOT yet live (this change).** The actually risky step:
  a full, parallel new-backend frontend for Ride, reachable at `/ride-v2` and `/drive-v2` -
  `RidePage.js`/`DriverRidePage.js` at the real, live `/ride` and `/drive` routes are completely
  untouched, byte-for-byte, and keep working on Sharetribe exactly as they do today. Nothing in
  the live app links to the new routes yet - reaching them means typing the URL directly.
  - `src/util/apiV2.js` - the missing piece for calling any `/api/v2` endpoint from the browser
    at all (nothing before this phase ever had). Calls `POST /api/v2/auth/bridge` automatically
    and caches the resulting JWT, re-bridging once if the server ever rejects it as expired.
  - `src/ride/rideProcessV2.js` - a deliberately SEPARATE, smaller state vocabulary from
    `rideProcess.js`, matching `RideRequest.STATUS_VALUES` directly instead of forcing the new
    backend's genuinely different model (broadcast dispatch, post-trip payment, no fee-tiered
    cancellation) through the Sharetribe process's 20-transition graph - see its file header.
  - `RidePageV2.duck.js` / `RidePageV2.js` - the rider side. Reuses everything in RidePage.js
    that was never Sharetribe-specific to begin with (Mapbox geocoding/directions, RideMap, the
    fare-estimate math, the actual `StripePaymentForm` integration) and replaces the rest:
    request → real server-computed fare and matching, poll `GET /api/v2/rides/:id` for status +
    live driver location, then - once `trip_completed` - `POST .../payments/rides/:id/intent`
    and the same Stripe confirm flow every other Phase 6 payment already uses.
  - `DriverRidePageV2.duck.js` / `DriverRidePageV2.js` - the driver side. Reuses
    `DriverRidePage.js`'s real GPS odometer hook verbatim (pure geolocation math, always was
    backend-agnostic) and replaces the Sharetribe listing/transaction calls with `/api/v2/
    drivers/*` and `/api/v2/rides/*`.
  - **A real gap this rewrite surfaced and closed rather than leaving silently broken**: nothing
    let a driver's app recover which ride they were on after a reload - `GET /api/v2/rides/
    active/mine` (new) fixes that; `ACTIVE_RIDE_STATUSES` was pulled out of `create.js` into
    `server/utils/rideStateMachine.js` so the two endpoints can't drift apart on what "busy"
    means. 2 additional automated checks covered this without touching the 14 from the
    lifecycle-parity pass.
  - **A real financial bug this rewrite caught before it ever ran for real**:
    `createRideIntent.js` was multiplying an already-in-cents `finalFare`/`estimatedFare` by
    100 again when building the Stripe charge amount - a ride that should cost $11.95 would have
    been charged as $1195.00. Nothing had ever exercised this endpoint against a real Phase-5
    fare value until this pass wired it into an actual payment flow, so the bug had been latent
    since Phase 6. Fixed to use the stored cents value directly - see the file's own updated
    header comment.
  - **Known, still-open gap, disclosed rather than papered over**: there's no driver-onboarding
    FORM on `/drive-v2` (vehicle make/model/plate, license) - only the tested backend endpoint
    for it. A driver with no `Driver` record sees a real message saying so.
  - **Not tested against a real deployment** (no MongoDB/Stripe/live Mapbox network access in
    the sandbox this was built in, and no way to drive an actual browser through geolocation
    prompts, Sharetribe login, and Stripe's test-card flow from here) - covered instead by: a
    real JSX/ES-module parser (`@babel/parser`, with the `jsx` plugin) run against every new
    file to catch syntax errors, and a manual, field-by-field trace of every action/reducer
    against the exact JSON shapes the real handlers above return (confirmed by reading each
    handler's actual `res.status(...).json(...)` calls, not assumed). **Before switching the
    live `/ride` and `/drive` routes over to these, or linking to `/ride-v2`/`/drive-v2` from
    anywhere in the UI, this needs a real end-to-end run**: `MONGODB_URI` and
    `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` configured for real, one rider account and one
    driver account, and an actual walk through request → match → accept → arrive → start →
    complete → pay.
- **Phase 9 - Provider profile + search frontend built, NOT linked anywhere (this change).**
  The other half of Phase 3 that had zero frontend consumer until now, built with the same
  parallel-route caution as the Ride rewire above - nothing existing was touched, and there was
  technically nothing live to protect here since no page ever called these endpoints before.
  - `src/util/apiV2.js` gained `apiV2Public()` - an unauthenticated variant of the existing
    `apiV2()` helper, for the two routes that are genuinely public in `server/apiRouter.js`
    (`GET /api/v2/categories`, `GET /api/v2/search/providers`). Using the authenticated helper
    against these would still work, but would needlessly force a logged-out visitor through a
    Sharetribe-login-then-bridge round trip just to browse a public list.
  - `/provider-profile-v2` (`ProviderProfilePageV2.duck.js`/`.js`) - a real create/edit form:
    name, description (20+ characters, matching the backend's own validation), a category
    checklist sourced live from `GET /api/v2/categories` (never a hand-typed, potentially-stale
    list) and filtered to exclude the Ride category (Ride uses a separate `Driver`
    onboarding flow, not `Business` - offering it here would be a checkbox that does nothing),
    service area label/radius, an actual "use my current location" button
    (`src/util/maps.js`'s `userLocation()` - real geolocation, not a fake default), contact
    phone, and pricing/availability notes. Loads any existing profile via `GET
    /api/v2/providers/me` and populates the form for editing when one exists; a genuinely new
    provider sees a genuinely empty form. Saves via the same real, tested `POST
    /api/v2/providers/me` from Phase 3.
  - `/providers-v2/:categorySlug` (`ProviderSearchPageV2.duck.js`/`.js`) - calls the real `GET
    /api/v2/search/providers`, with an opt-in "search near me" button (declined/unavailable
    geolocation just falls back to the category-wide, rating-sorted list rather than a fake
    location). An unknown category slug surfaces the backend's real 404 as a real "no such
    category" message, not a silent empty list. A real empty result set says so plainly rather
    than showing placeholder providers.
  - **Known, disclosed gaps, left open rather than faked**: no image/portfolio upload UI (the
    backend has no endpoint for it yet either); nothing links to either of these two routes from
    anywhere in the live UI - reaching them means typing the URL directly; no booking-request UI
    sits on top of a provider's profile yet (that's Phase 4's frontend, also still pending - see
    the Phase 4 entry above); and the same sandbox limitation as the Ride rewire applies - no
    real MongoDB/network access here, so verification was a `@babel/parser` syntax check on
    every new file plus a manual, field-by-field trace of every action/reducer against the exact
    JSON shapes `providers/me`, `search/providers`, and `categories` actually return (read
    directly from their handler source, not assumed). A real end-to-end run against a live
    database is still needed before linking these anywhere.
- **Phase 9 - Booking request/inbox frontend built, NOT linked anywhere (this change).** The
  Phase 4 UI that had been explicitly deferred since Phase 4 shipped - built the same way as the
  Provider profile/search pass right before it: parallel, unlinked routes, nothing existing
  touched.
  - **A real backend gap this pass found and closed rather than working around it**: there was
    no way to look up a single Business by id, only search results or your own profile
    (`GET /api/v2/providers/me`). A "request this provider" page reached directly by URL (a
    refresh, a bookmark, a shared link) would have had nothing to render. Added
    `GET /api/v2/providers/:id` (public, same reasoning as `GET /api/v2/search/providers` -
    see that file's header) - returns a real 404 for an unknown or deactivated business rather
    than silently serving stale data. 4 automated checks covered invalid-id-format, active,
    inactive, and not-found cases.
  - `/book-v2/:businessId` (`BookingRequestPageV2.duck.js`/`.js`) - a real request form: pick
    from the provider's own offered categories (never a hand-typed list), a 10+ character
    description matching the backend's own validation, an optional typed location label plus a
    real "use my current location" button, preferred date/time, an optional budget note, and
    additional notes. Loads the provider via the new endpoint above so the page works on a
    direct visit, not only when arriving from search with data already in memory. A
    `ProviderSearchPageV2` result card now links here via a new "Request this provider" link -
    the first real link between any two pieces of this v2 set.
  - `/my-bookings-v2` (`MyBookingsPageV2.duck.js`/`.js`) - a customer's real booking list from
    `GET /api/v2/bookings/mine`: status per booking, the provider's quoted price once accepted,
    a "Pay" button once accepted (identical Stripe integration to `RidePageV2.js` - the same
    `confirmCardPayment` thunk from `ducks/stripe.duck.js`, `StripePaymentForm`, and the same
    webhook-driven `paymentStatus` flip), and cancellation from any still-open state via
    `POST /api/v2/bookings/:id/status`.
  - `/provider-inbox-v2` (`ProviderInboxPageV2.duck.js`/`.js`) - a provider's real inbox from
    `GET /api/v2/bookings/inbox`: accept (with an actual quoted-price input - nothing is
    accepted without the provider typing a real number) or decline a pending request, then
    advance accepted work through scheduled -> in progress -> completed one real step at a
    time, enforced server-side by `bookingStateMachine.js` exactly as tested in Phase 4. A
    provider with no `Business` yet sees the backend's real, honest message and a link to
    `/provider-profile-v2` rather than an empty list with no explanation.
  - `src/booking/bookingProcessV2.js` - the same "mirror the real backend's own status
    vocabulary" approach as `src/ride/rideProcessV2.js`, matching `Booking.STATUS_VALUES` and
    `bookingStateMachine.js` directly rather than reusing a Sharetribe transaction process.
  - **Known, disclosed gaps, left open rather than faked**: no review UI yet on top of a
    completed booking (`POST /api/v2/reviews/bookings/:id` is built and tested but has no
    frontend consumer - a further Phase 9 item); no photo-upload UI on the request form (no
    upload endpoint exists yet either); after paying, this page re-fetches the whole booking
    list rather than polling the one booking, so `paymentStatus` may briefly still read
    "processing" until the next fetch after the Stripe webhook actually lands - the same kind
    of webhook-timing gap already disclosed for Ride's payment flow; nothing here is linked
    from the live site's actual navigation - reaching any of these three routes still means
    typing the URL, except for the one new internal link from search results into the request
    form. Verified the same way as every other frontend pass in this sandbox (no live
    MongoDB/Stripe/network access here): `@babel/parser` syntax-checked every new file, and
    every action/reducer was traced by hand against the exact JSON the real handlers return.
- **Phase 9 - Frontend rewire**, ongoing throughout: remove `sharetribe-flex-sdk` calls from each
  `*.duck.js` file as its backing phase lands; this is the biggest single piece of work by file
  count.
- **Phase 10 - Google Maps audit + Mapbox-only cleanup** (section 9/26): `SearchMapWithGoogleMaps.js`
  and any Google Maps env vars/config need auditing and removing once search itself no longer
  depends on Sharetribe's map-provider config switch.

## What you need to do for Phase 1 to come alive

1. Create a MongoDB database (MongoDB Atlas has a free tier - you'll need to sign up yourself,
   since account creation isn't something I can do for you) and get its connection string.
2. Add `MONGODB_URI` as an environment variable in the Render dashboard (and/or a local `.env`
   file for local dev - never commit it).
3. Run `node server/scripts/seedCategories.js` once (locally, with `MONGODB_URI` set) to populate
   the `categories` collection.
4. Redeploy. The homepage will then be reading categories from the database; before that, it
   transparently falls back to the old static list, so nothing breaks in the meantime.

## How Phase 2 was tested

MongoDB's own binary can't be downloaded in the sandbox this was built in (egress to
`fastdl.mongodb.org` / `repo.mongodb.org` is blocked there), so a real MongoDB integration test
wasn't possible in that environment. Instead, the exact handler and middleware code
(`server/api/v2/auth/*.js`, `server/middleware/authenticate.js`, `server/utils/jwt.js` -
byte-for-byte what's in this repo) was run against an in-memory stand-in for just the
`AppUser` Mongoose model, with 15 assertions covering the real bcrypt hashing/comparison and real
JWT sign/verify: signup succeeds and returns a token plus a password-free user; duplicate email
is rejected (409); a weak password is rejected (400); login succeeds with the right password and
rejects the wrong one and an unknown email identically (401, same message, no account
enumeration); `/me` rejects a missing token, an invalid token, and (once connected to a real
database) resolves a valid one to the live account. All 15 passed. Before this goes live, run it
once against your real MongoDB after setting `MONGODB_URI` and `JWT_SECRET` - e.g. `curl -X POST
.../api/v2/auth/signup -d '{"email":"you@example.com","password":"at least 8 chars","firstName":
"You","lastName":"Test"}' -H 'Content-Type: application/json'` - to confirm the real database
path end-to-end too.

## Category images: now real photographs (previously a known gap)

Spec section 35 calls for realistic photographic imagery per category. The flat-icon PNGs
generated earlier in this project (a broom/wrench/car-style icon with the category name baked
into the image itself) have been replaced with real photographs for all 21 categories, sourced
from Wikimedia Commons under free licenses (CC0, CC BY, CC BY-SA, and US-government public
domain - all compatible with commercial use with attribution).

This incidentally fixes a real visual bug too: because `CategoryHero.module.css` already renders
a category name as a separate text overlay on top of each tile image, the old icons - which also
had the name baked into the bottom of the icon - caused every category name to display twice on
the homepage (visible on the live site as "Ride Ride", "Home Improvement Home Improvement", etc).
The new photos have no text baked in, so each name now shows once, as designed.

**What changed:**
- All 21 files in `src/assets/categoryIcons/` and `public/static/categoryIcons/` were replaced,
  and switched from `.png` to `.jpg` (photos compress far better as JPEG than PNG - roughly
  50-260KB each here, vs. an estimated 300-700KB apiece if kept as PNG).
- Each new photo was center-cropped to a 4:3 aspect ratio (matching `CategoryHero.module.css`'s
  `.tile { aspect-ratio: 4/3 }` / `.tileImage { object-fit: cover }`) and resized to a max width of
  900px, so tiles fill cleanly with no letterboxing.
- `src/containers/LandingPage/CategoryHero/CategoryHero.js` - the 21 `import icon... from
  '.../categoryIcons/<id>.png'` lines were updated to `.jpg`. No other code changed; the
  `ICONS_BY_ID` map, the live `/api/v2/categories` fetch/fallback logic, and the tile JSX are
  untouched.
- `server/scripts/seedCategories.js` line 50 - the seeded `imageUrl` template literal was updated
  from `` `/static/categoryIcons/${c.id}.png` `` to `.jpg`, so once `MONGODB_URI` is configured and
  this script is (re-)run, the database-driven category list will point at the new photos too.

**Sourcing/verification process:** each candidate photo was found via the Wikimedia Commons API,
then actually opened and visually checked before being used - several plausible-looking search
results turned out to be wrong on inspection (a woodblock print, a vector cartoon, a tiny-house
carpentry-class photo mislabeled as plumbing, a military-desk photo with an unrelated promotional
poster) and were rejected in favor of a better match.

**Attribution (required by the CC BY / CC BY-SA licenses below; CC0 and public-domain entries
don't legally require it but are listed for completeness):**

| Category | Source file | License | Author |
|---|---|---|---|
| Auto Services | [Car mechanic worker repairing suspension with drill in garage](https://commons.wikimedia.org/wiki/File:Car_mechanic_worker_repairing_suspension_with_drill_in_garage.jpg) | CC BY 2.0 | Shixart1985 |
| Beauty | [Barber shop from Iran](https://commons.wikimedia.org/wiki/File:Barber_shop_from_Iran.jpg) | CC BY-SA 4.0 | Mostafameraji |
| Business Services | [A busy day in the office 02](https://commons.wikimedia.org/wiki/File:A_busy_day_in_the_office_02.jpg) | CC BY-SA 4.0 | Petbluzz |
| Cleaning | [20170104-RD-LSC-0953](https://commons.wikimedia.org/wiki/File:20170104-RD-LSC-0953_(52475849574).jpg) | Public domain | U.S. Department of Agriculture |
| Electrical | [Electrician installing socket](https://commons.wikimedia.org/wiki/File:Electrician_installing_socket.jpg) | CC BY-SA 4.0 | Santeri Viinamäki |
| Events | [Table decorations during reception](https://commons.wikimedia.org/wiki/File:Table_decorations_during_reception.jpg) | CC BY-SA 4.0 | Jess Mann |
| Handyman | [Handyman measuring a board](https://commons.wikimedia.org/wiki/File:Handyman_measuring_a_board.jpg) | CC BY 2.0 | Ivan Radic |
| Home Improvement | [2024-04-30 Carpenter at work DSC 0205](https://commons.wikimedia.org/wiki/File:2024-04-30_Carpenter_at_work_DSC_0205.JPG) | CC BY-SA 4.0 | Bärbel Miemietz |
| HVAC | [379th ECES HVAC technicians combat rising temperatures](https://commons.wikimedia.org/wiki/File:379th_ECES_HVAC_technicians_combat_rising_temperatures_(8502257).jpg) | Public domain | U.S. Air Force / Airman 1st Class Derrick Bole |
| Landscaping | [Gardener tending to plants with care in a vibrant garden](https://commons.wikimedia.org/wiki/File:Gardener_tending_to_plants_with_care_in_a_vibrant_garden.jpg) | CC BY 2.0 | Shixart1985 |
| Lawn Care | [Lawn care in a vibrant garden as a person mows the grass on a sunny day](https://commons.wikimedia.org/wiki/File:Lawn_care_in_a_vibrant_garden_as_a_person_mows_the_grass_on_a_sunny_day.jpg) | CC BY 2.0 | Shixart1985 |
| Moving | [Arpin Van Lines moving van, Superior Township, Michigan](https://commons.wikimedia.org/wiki/File:Arpin_Van_Lines_moving_van_Superior_Township_Michigan.JPG) | CC BY 3.0 | Dwight Burdette |
| Painting | [Fort Kochi - Wall Painters on ropes](https://commons.wikimedia.org/wiki/File:Fort_Kochi_-_Wall_Painters_on_ropes.jpg) | CC BY-SA 4.0 | Ingo Mehling |
| Personal Services | [A hotel concierge handing room keys, Rome](https://commons.wikimedia.org/wiki/File:A_hotel_concierge_handing_room_keys,_Rome_-_3566.jpg) | CC BY-SA 3.0 | Jorge Royan |
| Pet Services | [Fort Greene, Brooklyn - lady walking four dogs](https://commons.wikimedia.org/wiki/File:Fort_Greene_Brooklyn_NY_assorted_photos_near_Fulton_Street_2_lady_walking_four_dogs.jpg) | CC0 | Tomwsulcer |
| Photography | [A man with a camera](https://commons.wikimedia.org/wiki/File:A_man_with_a_camera.jpg) | CC BY-SA 4.0 | Chandrakumarkma |
| Plumbing | [Cameroon male plumber at work 03](https://commons.wikimedia.org/wiki/File:Cameroon_male_plumbier_at_work_03.jpg) | CC BY-SA 4.0 | Gatien TITCHO SEUMO |
| Pressure Washing | [Car washing activity at a residential driveway](https://commons.wikimedia.org/wiki/File:Car_washing_activity_at_a_residential_driveway.jpg) | CC BY 2.0 | Shixart1985 |
| Ride | [LTI TXII Taxi, Baku](https://commons.wikimedia.org/wiki/File:LTI_TXII_Taxi,_Baku.jpg) | CC BY 2.0 | shankar s. |
| Technology | [Replacing hardware](https://commons.wikimedia.org/wiki/File:Replacing_hardware_160210-F-KR223-021.jpg) | Public domain | Airman 1st Class Jordyn Fetter, U.S. Air Force |
| Tutoring | [The Tutoring Center](https://commons.wikimedia.org/wiki/File:The_Tutoring_Center_(5532422757).jpg) | CC BY 2.0 | Tulane Public Relations |

**Remaining known gap:** these are stock photographs of generic/representative scenes for each
trade, not photos of Servio's actual providers or listings - there's no way to have real "this is
what our providers look like" photography until real providers are on the platform. If Servio
wants to replace these with real provider/customer photos later, the only files that need to
change are the 21 images at the two `categoryIcons/` paths above (or the `imageUrl` field per row
in the database, once seeded) - no application code changes needed, same as before.

## Homepage location box: now visually "locks in" a location

Previously the location box at the top of the homepage was a plain, unstyled search input - it
worked (typing opened a predictions dropdown, picking a place was remembered and passed along to
category search results as real map bounds), but nothing about it *looked* like it was doing
anything, so it wasn't obvious the location was actually being used to filter listings.

**What changed** (`src/containers/LandingPage/CategoryHero/CategoryHero.js` and its CSS module):
- The input now shows a location-pin icon (was the generic search-glass icon).
- Once a real place is selected from the dropdown, the input is replaced by a green "locked in"
  pill showing a checkmark, the chosen address, a **Change** link (reopens the input, pre-filled,
  to pick somewhere else), and a small **x** (clears the location entirely). The subtitle text
  below the heading also updates to say "Showing categories near <address>" while locked.
- No backend or filtering logic changed - `goToCategory` already attached the selected place's
  map bounds (`searchParams.bounds`) to every category search, and `SearchPage.duck.js` already
  passes a `bounds` URL param straight through to the real `latlngBounds` search-listings query
  param, so a locked-in location was already restricting results to that area; this pass only
  made that fact visible in the UI.
- General visual polish pass on the same component while in there: tighter heading tracking,
  card-style shadows on the location box/search box/category tiles, a subtle hover lift + zoom on
  category tiles, and a search icon inside the category filter box.
