# Ride - Console setup runbook

Companion to `sharetribe-setup/README.md` (the general Servio Console runbook) and
`RIDE_INTEGRATION_REPORT.md` (the architecture writeup). Everything in the Ride codebase is written
and ready; this document is the remaining Console/CLI work needed to make it live, because Sharetribe
Flex - not this repository - owns categories, listing types, transaction processes, and commission
(see the integration report, section 5-6). Do these in order, in your **Test** environment first.

---

## 1. Install and authenticate the Sharetribe CLI

This environment has no `flex-cli` installed and no populated `.env`, so none of the steps below could
be run from here - they need to be run from your own machine with your Sharetribe account.

```
npm install -g flex-cli
flex-cli login
```

## 2. Push the `ride` transaction process

The process definition and its email templates are already in this repo at
`ext/transaction-processes/ride/`, written in the same v3 format and using the same real Sharetribe
process actions as the existing `default-negotiation`/`default-booking`/etc. processes already
shipped here - see the comments at the top of `ext/transaction-processes/ride/process.edn` for exactly
which actions and why.

```
flex-cli process push --process=ride --path=ext/transaction-processes/ride --marketplace=<your-marketplace-env>
```

**Read the CLI's output carefully.** This process has not been validated against Sharetribe's real
process schema in this environment (no CLI access here - see above), so this push is the first real
validation it gets. If it's rejected, the error will point at the specific transition/action; the
most likely issues, if any, are ones a first real push commonly surfaces (a typo in an action name, an
`:at` timer expression). Fix and re-push - `process push` is safe to repeat.

Once it succeeds, confirm the alias is `ride/release-1` (Console: **Build > Transaction process**). If
Console assigns a different alias, update it in two places: `src/config/configListing.js`
(`ride-driver` listing type's `transactionType.alias`) and `src/ride/rideProcess.js`'s `graph.id`
comment.

## 3. Create the `ride` category

`sharetribe-setup/categories.json` now includes a `ride` entry (added alongside the existing 20).
Console: **Build > Content > Categories** - add it the same way you set up the other 20 (see
`sharetribe-setup/README.md` section 6). Keep the id exactly as `ride` - it's referenced by
`src/config/configServiceCategories.js` and the `/services/ride` SEO page.

## 4. Create the `ride-driver` listing type and its fields

`src/config/configListing.js` already defines the `ride-driver` listing type and its six listing
fields (`vehicleMake`, `vehicleModel`, `vehicleColor`, `vehicleYear`, `licensePlate`, `rideType`,
`isOnline`) in the same local-dev-fallback pattern the existing `service`/`job-request` types use -
this means **you can start testing locally (`NODE_ENV=development`) immediately**, before touching
Console at all, same as section 7 of the main README explains.

Before production, recreate the same listing type and fields in Console (**Build > Listings >
Listing types** / **Listing fields**), matching the values in `configListing.js` exactly:

- `listingType: ride-driver`, `process: ride`, `alias: ride/release-1`, `unitType: item`
- The `isOnline` and `rideType` fields **must** have their search index turned on
  (`indexForSearch: true` is already set in the local config - the Console equivalent is a toggle
  when creating the field). Without this, `server/api-util/rideDispatch.js`'s driver-matching query
  (`pub_isOnline=true`) silently returns zero candidates - every ride request will incorrectly show
  "no drivers found" even with drivers online. This is the single most important thing to get right
  in this whole runbook.

## 5. Create the ride pricing asset

`server/api-util/ridePricing.js` and `src/config/configRidePricing.js` both fall back to sane defaults
(base fare $2.50, $1.25/mi, $0.22/min, $6 minimum, $5 cancellation fee) if this asset doesn't exist,
so Ride is testable before you do this step - but the numbers become admin-editable (spec section 14)
only once it exists.

Console: **Build > Content** (wherever custom JSON content assets live in your Console version) -
create a JSON asset at path `ride/ride-pricing.json` with this shape:

```json
{
  "baseFareInSubunits": 250,
  "perMileInSubunits": 125,
  "perKmInSubunits": 78,
  "perMinuteInSubunits": 22,
  "minimumFareInSubunits": 600,
  "cancellationFeeInSubunits": 500,
  "serviceFeeInSubunits": 0,
  "surgeMultiplier": 1,
  "unitSystem": "imperial",
  "currency": "USD"
}
```

## 6. Confirm commission applies to Ride

Ride reuses the exact same commission asset every other Servio transaction uses (`fetchCommission` in
`server/api-util/sdk.js`) - there is nothing Ride-specific to configure here. Whatever provider/
customer commission percentage you've set for the rest of Servio (main README section 4) applies to
ride fares too, automatically.

## 7. Nothing new needed for Mapbox or Stripe

Ride reuses Servio's existing `REACT_APP_MAPBOX_ACCESS_TOKEN` and Stripe Connect setup as-is - no new
token, no new Stripe configuration. If Mapbox Directions API calls start failing in production, check
that your existing Mapbox token has the Directions API enabled for its scope (Geocoding-only tokens
won't work for route/fare estimation).

## 8. Topbar/homepage "Ride" entry point

`/services/ride`, `/ride`, and `/drive` are real, working routes as soon as the app is deployed - no
Console step required to reach them directly. Adding a persistent "Ride" link to the main navigation
or homepage is a **content change in Console** (Content > Topbar / homepage Page Builder, per main
README section 9) - this repo's Topbar has no local link array to edit in code (unlike categories/
listing types, it has no local fallback, matching how the rest of Servio's nav already works).
Suggested link: **Ride -> `/ride`**, alongside your other top-level links, plus a **"Drive with
Servio" -> `/drive`** link somewhere aimed at existing providers.

## 9. Testing checklist before calling this done

Once steps 1-5 are live in your Test environment:

- [ ] A test user can publish a `ride-driver` listing with vehicle details.
- [ ] Toggling online on `/drive` actually flips `isOnline` (check via Console's listing inspector).
- [ ] A second test user on `/ride` sees that driver matched (confirms the search index from step 4).
- [ ] Full happy path: request -> pay -> accept -> en route -> arrived -> start -> complete -> receipt
      -> payout -> review, per spec section 27's customer/driver checklists.
- [ ] No driver online -> `/ride` shows "no drivers available", not a stuck spinner.
- [ ] Driver declines / doesn't respond within 25s -> rider is offered the next candidate, not charged
      twice.
- [ ] Two browser sessions both viewing the same incoming request - only one can successfully accept
      (spec section 8/27 "duplicate acceptance") - see the residual race-window note in
      `server/api-util/rideDispatch.js`'s `lockDriverListing` comment; load-test this specifically.
- [ ] Cancel before driver assigned -> full refund, no fee. Cancel after assigned -> cancellation fee
      charged, driver paid their share.
- [ ] GPS denied/disabled on the driver side during a trip -> the app surfaces this rather than
      silently reporting stale/zero distance (see `DriverRidePage.js`'s `useTripOdometer`).
- [ ] `yarn install && yarn test` - this environment could not run the existing test suite (no
      `node_modules`, dependencies were never installed here), so the new files have only been
      verified with `node --check` (real syntax validation, passed) and manual review, not by
      actually running the app. Run the full suite once you have a normal dev environment, before
      treating this as production-ready.
