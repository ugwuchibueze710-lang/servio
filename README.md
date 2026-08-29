# SERVIO

SERVIO is a two-sided local service marketplace connecting customers with trusted local service
providers - home services, cleaning, auto, events, and more. Launching across western Kentucky and
southern Indiana (Owensboro, Evansville, Henderson, Madisonville, Newburgh, Louisville, and
surrounding communities), architected to expand nationwide.

This repository is SERVIO's web application: a customized [Sharetribe Web
Template](https://github.com/sharetribe/web-template) (React + Redux Toolkit + server-side
rendering), which is the frontend for the [Sharetribe](https://www.sharetribe.com/) marketplace
engine (accounts, listings, search, messaging, transactions, Stripe-powered payments, and reviews).

## Start here

- **`sharetribe-setup/README.md`** - the runbook for configuring the actual Sharetribe marketplace
  (Console setup, categories, listing types, commission, Stripe, branding, footer content). Required
  reading before this app can do anything beyond render a maintenance-mode screen.
- **`.env.example`** - every environment variable this app uses, with explanations and links to where
  to get each credential.
- **`DEPLOYMENT.md`** - how to deploy to production (Render config included), plus a pre-launch test
  plan.

## Local development

```sh
yarn install                 # install dependencies (requires Node ^22.22.0 or >=24.0.0)
yarn run config               # writes a local .env from .env-template - fill in real values after
yarn run dev                  # starts the dev server at http://localhost:3000
```

You need at least a Sharetribe Client ID (and, since SERVIO uses privileged transitions, a Client
Secret), a Mapbox access token, and eventually a Stripe publishable key - see
`sharetribe-setup/README.md` step 1-2 and `.env.example`. Without valid Sharetribe credentials the app
still boots and renders a graceful "maintenance mode" page rather than crashing (see
`src/app.js` / `MaintenanceModeError`).

## Architecture notes specific to SERVIO

- **Listing types & transaction flow**: SERVIO uses Sharetribe's built-in `default-negotiation`
  transaction process for both provider-priced "Service" listings and customer-posted "Job request"
  listings - see `src/config/configListing.js` and `src/transactions/transactionProcessNegotiation.js`.
  This covers post job → get quotes → message → accept → pay (Stripe via Sharetribe) → complete →
  review, with no custom-built parallel transaction system.
- **Branding**: `src/config/configBranding.js` (logo, marketplace color `#0E7490`), overridden by
  Sharetribe Console's branding asset once configured there.
- **Categories & listing fields**: local fallback in `src/config/configListing.js` (used in local
  dev), superseded by Sharetribe Console once configured (`sharetribe-setup/categories.json` has the
  20 launch categories in the format Console/CLI expects).
- **Maps/location**: Mapbox (`src/config/configMaps.js`), with the launch region's cities as
  *suggested* default location searches (`src/config/configDefaultLocationSearches.js`) - this does
  not restrict search to those cities.
- **SEO landing pages**: `/services/:categorySlug` and `/location/:citySlug`
  (`src/containers/ServiceCategoryPage`, `src/containers/ServiceAreaPage`) - real content per page,
  linking into genuine search results. Content source: `src/config/configServiceCategories.js` /
  `configServiceAreas.js`. Included in the sitemap via `server/resources/sitemap.js` and
  `server/resources/servioSeoPaths.js`.
- **Invoice PDF downloads**: `server/api/invoice-pdf.js` + `src/components/InvoiceDownloadButton` -
  a self-contained, on-demand "Download invoice (PDF)" action available to either party once a
  transaction has actually been paid. The PDF generator (HTML templates, mustache-style renderer,
  formatting helpers) was ported from Billzy, a separate invoicing app, and adapted to run in this
  app's own Node/Express server with Puppeteer instead of Billzy's original Python/WeasyPrint
  renderer - see `server/invoice/` for the ported code and why each change was made. On by default;
  see `.env.example` section 12 to disable it or DEPLOYMENT.md for the one deployment caveat.
- **10% marketplace commission**: configured in Sharetribe Console (not hardcoded in this repo) - see
  `sharetribe-setup/README.md` step 4. The checkout/order-breakdown UI already renders whatever
  commission Console computes (`src/components/OrderBreakdown/LineItemProviderCommissionMaybe.js`).

## Original template documentation

Sharetribe's own docs for this template (component conventions, Redux ducks pattern, transaction
process internals, deployment basics) are still the best reference for *how the codebase works*:
https://www.sharetribe.com/docs/ and `AGENTS.md` in this repo. This file (`README.md`) covers what's
specific to SERVIO; `AGENTS.md` covers the underlying template architecture and code conventions.

## License

This repository builds on the Sharetribe Web Template, licensed under Apache-2.0 (see `LICENSE`).
