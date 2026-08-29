# SERVIO - Sharetribe Console setup runbook

This repo (the Sharetribe Web Template, rebranded and configured for SERVIO) is the **frontend**.
Sharetribe is the **marketplace engine**: user accounts, listings, search, messaging, transactions,
payments, and reviews all live there. A large part of "finishing" SERVIO for real customers happens
in **Sharetribe Console** (console.sharetribe.com), not in this codebase - that's Sharetribe's
architecture, not a shortcut. This document is the step-by-step path from "code is ready" to "real
customers can sign up, post jobs, get quotes, and pay."

Do this in order. Steps 1-4 are required before the app can do anything real. Steps 5+ round out the
production experience described in the SERVIO spec.

---

## 1. Create your Sharetribe account and marketplace

1. Go to https://www.sharetribe.com/ and start a plan (or a trial), which creates your Console
   account and a marketplace environment.
2. In Console, you'll get both a **Test** and (once ready) a **Live** environment. Build and test
   everything in Test first.

## 2. Create an API client (Client ID + Secret)

1. In Console: **Build > Applications** (sometimes labeled "Client apps" / "Integrations" depending
   on Console version - look for where API client credentials live).
2. Create a new client app for the SERVIO web app.
3. Copy the **Client ID** into `REACT_APP_SHARETRIBE_SDK_CLIENT_ID`.
4. Because SERVIO uses the `default-negotiation` transaction process, several transitions
   (`make-offer`, `make-offer-from-request`, counter-offers, etc.) are **privileged** and must run
   server-side - see `src/transactions/transactionProcessNegotiation.js`'s `isPrivileged()`. Copy the
   **Client Secret** into `SHARETRIBE_SDK_CLIENT_SECRET` (server-only env var, never exposed to the
   browser, never committed to git).

## 3. Enable the `default-negotiation` transaction process

SERVIO's two listing types (`service` and `job-request`, defined in
`src/config/configListing.js`) both use Sharetribe's built-in **default-negotiation** transaction
process - this is what powers "post a job → get quotes → accept → pay → complete → review" without
inventing a custom payment/escrow system.

1. Confirm `default-negotiation` is enabled for your marketplace environment. Sharetribe's newer
   marketplace environments generally have all default processes (including `default-negotiation`)
   available out of the box; if yours doesn't show it in Console under **Build > Transaction
   process**, use the Sharetribe CLI to push it - see
   https://www.sharetribe.com/docs/how-to/change-transaction-process-in-ftw/ and the process/template
   files already included in this repo at `ext/transaction-processes/default-negotiation/` (process
   definition + all email templates, ready to push as-is).
2. Note the process alias you end up with (this repo assumes `default-negotiation/release-1`, which
   is what `src/config/configListing.js` and `src/transactions/transaction.js` reference). If Console
   gives you a different alias, update `alias` in `src/config/configListing.js`.

## 4. Set the marketplace commission (10%)

1. Console: **Build > Transaction process** (or wherever "Commission" configuration lives for the
   `default-negotiation` process in your Console version).
2. Set **provider commission = 10%**, **customer commission = 0%**. That reproduces the spec's
   example exactly: a $200 job → $20 platform commission → $180 to the provider (before any Stripe
   processing fees, which Stripe deducts separately and are not marketplace revenue - the checkout UI
   already shows these as distinct via `src/components/OrderBreakdown/LineItemProviderCommissionMaybe.js`
   and the other `LineItem*` components - no code change needed here, just the Console %).

## 5. Connect Stripe

1. Create a Stripe account (or use an existing one) at https://dashboard.stripe.com.
2. Console: **Build > Payments** (or **Stripe** in your Console version) - connect the account and
   enter the Stripe **secret** key there. Console holds the secret key; this repo never sees it.
3. Put the Stripe **publishable** key in `REACT_APP_STRIPE_PUBLISHABLE_KEY` (see `.env.example`).
4. Decide which countries/currencies you support (Console: Stripe settings) - `src/config/configStripe.js`
   has related client-side settings like `dayCountAvailableForBooking` and `defaultMCC`.

## 6. Categories

`sharetribe-setup/categories.json` in this folder contains SERVIO's 20 launch categories (Home
Improvement, Cleaning, Landscaping, Plumbing, Electrical, HVAC, Moving, Auto Services, Photography,
Events, Beauty, Pet Services, Technology, Tutoring, Personal Services, Business Services, Handyman,
Lawn Care, Pressure Washing, Painting), several with subcategories, in the exact JSON shape this
template's `src/util/configHelpers.js` documents for the categories asset (`{ categories: [{ name,
id, subcategories }] }`).

1. Console: **Build > Content > Categories** (naming may vary slightly by Console version) - either
   recreate this list through Console's category editor, or, if your plan/version supports asset
   import via Sharetribe CLI, push `categories.json` directly.
2. **Keep the `id` values exactly as given** (`home-improvement`, `cleaning`, etc.) - they're
   referenced by the SEO landing pages at `/services/:categorySlug`
   (`src/config/configServiceCategories.js` and `server/resources/servioSeoPaths.js`). If you rename
   an id, update those two files too.
3. Categories can be edited any time in Console with no app redeploy - that's the point of this
   architecture (see requirement #19 in the product spec).

## 7. Listing types and listing fields

`src/config/configListing.js` already defines SERVIO's two listing types locally
(`service` = provider-priced listings, `job-request` = customer-posted jobs) and three shared
listing fields (years in business, licensed & insured, service radius). These are merged in
automatically during local development (`NODE_ENV=development`) so you can test immediately, but
**production builds ignore local listing types/fields by design** (see the comment in
`src/util/configHelpers.js` `mergeListingConfig`) - Sharetribe's own guidance is not to rely on debug
config in production.

Before launch, recreate the same listing types and fields in Console:
**Build > Listings > Listing types** and **Build > Listings > Listing fields** (or similar, depending
on Console version). Use the exact same `listingType`/`key` values, `process: default-negotiation`,
`alias: default-negotiation/release-1`, and `unitType` (`offer` for the "service" type, `request` for
the "job-request" type) shown in `src/config/configListing.js` - once Console has them, the hosted
config automatically takes precedence over the local fallback, so nothing else changes.

## 8. Branding

Console: **Design** tab - upload:

- **Logo** and **favicon/app icon**: use the generated files in `src/assets/servio-logo-desktop.png`,
  `servio-logo-mobile.png`, or regenerate larger/vector versions from the brand system described in
  `src/config/configBranding.js` (primary color `#0E7490`, near-black ink `#0B1220`).
- **Marketplace color**: `#0E7490` (already set as the local fallback too, so Console and code stay
  visually consistent even before you've configured Console).
- **Social sharing images**: `src/assets/servio-facebook-sharing-1200x630.jpg` and
  `servio-twitter-sharing-600x314.jpg`.

Once Console's branding asset is configured, it overrides the local fallback automatically - no code
change needed to update your brand later.

## 9. Footer and top navigation content

Unlike categories/listing types, the footer has **no local fallback at all**
(`src/containers/FooterContainer/FooterContainer.js` renders nothing until the footer asset exists) -
so this step isn't optional. Console: **Content > Footer** and **Content > Topbar** (naming varies by
version) generally give you a visual editor for columns, links, and social icons rather than raw
JSON. Suggested SERVIO footer content:

- **Column 1 - SERVIO**: short description ("SERVIO connects customers across western Kentucky and
  southern Indiana with trusted local service providers."), social links (once you have real
  accounts).
- **Column 2 - For customers**: links to `/s` (Browse services), `/l/new` (Post a job),
  `/signup` (Sign up).
- **Column 3 - For providers**: link to `/signup` with a "Become a provider" call to action, and to
  `/l/new` for creating a service listing.
- **Column 4 - Company**: `/terms-of-service`, `/privacy-policy`, and a contact/support link.
- **Copyright**: "© {year} SERVIO. All rights reserved."

Top navigation: keep it to primary links (Browse services, Post a job) plus the built-in
login/signup/inbox/account menu the Topbar already renders.

## 10. Email templates

The `default-negotiation` process ships with a complete set of transactional email templates in
`ext/transaction-processes/default-negotiation/templates/` (new quote request, new offer, accepted
offer, delivered, review reminders, etc.) - these already use `{{marketplaceName}}`-style variables,
so they pick up "SERVIO" automatically once the marketplace name is set. In Console: **Build > Email
templates** (or **Branding > Emails**), set the sender name/address (e.g. `SERVIO <hello@servio.com>`)
and, if you have a verified sending domain, configure it there.

## 11. Domain, HTTPS, and go-live checklist

- Point your domain (e.g. `servio.com`) at your hosting provider (see `render.yaml` /
  `DEPLOYMENT.md` in the repo root) and set `REACT_APP_MARKETPLACE_ROOT_URL` accordingly.
- Switch from Sharetribe's **Test** environment credentials to **Live**, and Stripe from test mode to
  live mode, only after you've run through the test plan in `DEPLOYMENT.md`.
- Re-check `REACT_APP_CSP=block` (not `report`) once you've confirmed nothing is broken in report
  mode.

## 12. Mapbox and other third-party accounts

See `.env.example` for Mapbox, analytics, Sentry, and social login setup - those don't require
Console configuration, just the env vars.
