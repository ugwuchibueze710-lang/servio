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
  this sandbox's MongoDB access). **Not yet done: the frontend doesn't call any of this.**
  Category tiles on the homepage still route to Sharetribe's own `SearchPage`
  (`pub_categoryLevel1` filter against Sharetribe listings) - swapping that for this new endpoint
  is Phase 9 work, deliberately deferred so today's live search (which does work end-to-end on
  Sharetribe right now) isn't put at risk until the new path has a live database backing it and a
  provider profile UI (also Phase 9) for people to actually register through.
- **Phase 4 - Booking lifecycle.** Customer service requests, provider inbox, accept/decline,
  status tracking (section 6/7).
- **Phase 5 - Ride matching.** `Driver`/`Vehicle` onboarding, online/offline toggle,
  `RideRequest` state machine, Socket.IO for real-time accept/decline and location updates
  (section 12-14). Servio's existing `RidePage.js`/`DriverRidePage.js` get rewired to call the new
  API instead of Sharetribe's `ride` transaction process.
- **Phase 6 - Payments.** Stripe Payment Intents + Stripe Connect (for provider/driver payouts),
  replacing Sharetribe's Stripe integration, shared by both service bookings and rides (section
  15-17). `stripe` is already added to `package.json` for this phase.
- **Phase 7 - Reviews**, tied to completed `Booking`/`RideRequest` documents only (section 20).
- **Phase 8 - Admin CRUD** for categories/users/providers/drivers/bookings/rides (section 23),
  replacing manual `seedCategories.js` runs.
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

## Known gap: category images are not real photographs yet

Spec section 35 calls for realistic photographic imagery per category. The current `imageUrl`
values point at the flat-icon PNGs generated earlier this project (now served from
`public/static/categoryIcons/`), not real photography - I don't have a stock-photo or image
licensing source available. Swapping them for real photos later is just a matter of replacing the
files at those same paths (or updating `imageUrl` in the database) - no application code changes
needed, by design.
