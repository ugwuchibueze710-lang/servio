# Deploying SERVIO

SERVIO is a Node.js app with a custom Express server that does server-side rendering (SSR) - it is
**not** a static site. It needs a host that runs a persistent Node process, not a static-file CDN.

## Prerequisites

Before deploying anywhere, complete `sharetribe-setup/README.md` steps 1-5 (Sharetribe marketplace +
API credentials, transaction process, commission, Stripe) and get a Mapbox token. You need real
values for at least:

- `REACT_APP_SHARETRIBE_SDK_CLIENT_ID`
- `SHARETRIBE_SDK_CLIENT_SECRET`
- `REACT_APP_STRIPE_PUBLISHABLE_KEY`
- `REACT_APP_MAPBOX_ACCESS_TOKEN`
- `REACT_APP_MARKETPLACE_ROOT_URL` (your real domain, once known)

See `.env.example` for the complete list with explanations.

## Option A: Render (recommended, config included)

This repo includes `render.yaml` at the project root, ready to use as a
[Render Blueprint](https://render.com/docs/blueprint-spec):

1. Push this repo to GitHub (or GitLab).
2. In the Render dashboard: **New > Blueprint**, point it at the repo.
3. Render reads `render.yaml` and creates a single web service (`servio`) with the build command
   `yarn install --frozen-lockfile && yarn build` and start command `yarn start`.
4. Fill in the env vars Render prompts for (everything marked `sync: false` in `render.yaml` - these
   are secrets and are intentionally not committed to git).
5. After the first deploy, note the assigned `*.onrender.com` URL (or attach your own domain under
   **Settings > Custom Domains**), set `REACT_APP_MARKETPLACE_ROOT_URL` to that exact URL, and
   redeploy.
6. Render terminates HTTPS for you automatically on both the default domain and custom domains.

`render.yaml` is currently set to Render's **free** plan (no card required) so you can stand this
up and wire in credentials without committing to a paid plan yet. Free web services spin down
after 15 minutes of inactivity and cold-start on the next request - fine for setup and testing,
not for real users. Before real launch traffic, change `plan: free` to `plan: starter` in
`render.yaml` (or switch it in the Render dashboard under the service's Settings), and move to
Standard/Pro once you have production traffic (SSR is more CPU-intensive per request than a
static site).

## Option B: Any other Node host (Railway, Fly.io, a VPS, etc.)

The build/start commands are the same everywhere:

```sh
yarn install --frozen-lockfile
yarn build      # runs build-web (webpack client+server bundles) and build-server
yarn start      # node server/index.js
```

Requirements: Node `^22.22.0 || >=24.0.0` (see `package.json` `engines`), all env vars from
`.env.example` set, and the process listening on the `PORT` your host assigns (already handled by
`server/index.js`). Put the app behind HTTPS (either the host's own TLS termination, or a reverse
proxy) and set `SERVER_SHARETRIBE_TRUST_PROXY=true` / `REACT_APP_SHARETRIBE_USING_SSL=true` so
cookies and redirects behave correctly behind that proxy.

## Invoice PDF downloads (Puppeteer/Chromium)

The optional "Download invoice (PDF)" feature (`server/api/invoice-pdf.js`) uses Puppeteer, which
downloads its own self-contained Chromium build during `yarn install` - no extra buildCommand
changes needed, and `render.yaml`'s `yarn install --frozen-lockfile && yarn build` already covers
it. This is known to work on Render's standard Node web service.

If a deploy target's base image is missing Chromium's shared libraries (uncommon, but possible on a
minimal/stripped Linux image), the endpoint fails closed with a clear `503` error rather than a
broken file - the rest of the app is unaffected. If you hit that:

- On Render, switching the service's runtime to `Docker` with a Dockerfile based on
  `node:22-bookworm` (rather than the default `node:22-slim`-style native runtime) generally
  resolves it, since the full Debian image already carries the libraries Chromium needs
  (`libnss3`, `libatk1.0-0`, `libgtk-3-0`, `libasound2`, etc.).
- Or set `REACT_APP_INVOICE_PDF_ENABLED=false` to hide the feature entirely until you have time to
  address it - it's optional by design (see `.env.example` section 12), so this never blocks launch.

## About Vercel

Vercel is built around static sites, Next.js, and stateless serverless functions. This template is
none of those - it's a persistent Express server doing full SSR with its own dev/build pipeline
(`server/index.js`, `server/apiServer.js`, code-split SSR bundles via `@loadable/component`). Making
it run correctly on Vercel would require re-architecting the server as serverless functions and is a
non-trivial, separate project on its own - not something to fake with a `vercel.json` that silently
doesn't work. Render (or another persistent-Node host) is the honest recommendation for this
codebase as-is.

## Domain & DNS

1. Buy/point your domain (e.g. `servio.com`) at your host per their instructions (Render: add a
   Custom Domain, then create the CNAME/A record your DNS provider needs).
2. Set `REACT_APP_MARKETPLACE_ROOT_URL=https://www.servio.com` (no trailing slash).
3. Re-run/redeploy after changing that variable - it's baked into SSR meta tags, sitemap URLs, and
   SSO callback URLs.

## Pre-launch test plan

Run through this in the **Test** Sharetribe environment (Stripe in test mode) before flipping to
Live:

**Customer**: sign up → verify email → search a service category → view a provider profile → post a
job request (with photo + budget + preferred date) → receive a provider's quote (use a second test
account as the provider) → message back and forth → accept the quote → pay with a
[Stripe test card](https://stripe.com/docs/testing) → see the transaction move to "accepted" →
mark/see it delivered → leave a review.

**Provider**: sign up → complete profile (business name, description, categories, service area) →
publish a service listing → find a job request → send a quote (or respond to a request) → message the
customer → get paid after the customer accepts and pays → view earnings/payout status
(`/account/payments`) → receive and optionally respond to a review.

**Admin**: log into Sharetribe Console (this *is* the SERVIO admin panel for user/listing/transaction
management, content moderation, and reports - see `sharetribe-setup/README.md`) → review the test
transaction → check the 10% commission was applied correctly → moderate a listing/review if needed.

Fix anything that breaks in this flow before considering the marketplace launch-ready.
