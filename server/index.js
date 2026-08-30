/**
 * This is the main server to run the production application.
 *
 * REWRITTEN to drop Sharetribe entirely:
 *  - No more MANDATORY_ENV_VARIABLES check on Sharetribe SDK credentials at boot.
 *  - No more custom server-side RENDERING pipeline (no more calling the Sharetribe SDK or
 *    React's renderToString on every page request - that coupling is exactly what made the
 *    whole site crash/500 the moment Sharetribe credentials were removed).
 *  - Instead: a plain client-rendered single-page app. The already-working /v2/* Mongo/Stripe
 *    backend (server/apiRouter.js) is untouched and mounted exactly as before at /api.
 *
 * IMPORTANT - do not confuse "no SSR" with "serve build/index.html raw": that was a real,
 * severe bug (caused a total blank-page outage). build/index.html is not a plain static file -
 * it is a template (see public/index.html) with `<!--!ssrScripts-->` / `<!--!ssrLinks-->` /
 * `<!--!ssrStyles-->` HTML-comment placeholders that MUST be substituted with the actual
 * `<script>`/`<link>`/`<style>` tags for the built JS/CSS bundles before being sent to a
 * browser - otherwise the page has no script tag at all and nothing ever loads. The original
 * codebase's server/renderer.js (deleted along with the rest of the SSR pipeline) filled these
 * in via @loadable/server's ChunkExtractor as part of full SSR; renderIndexHtml() below does
 * the same chunk-tag substitution WITHOUT any SSR - no Sharetribe SDK call, no React
 * renderToString, just "what scripts/styles does the built app need to boot" - exactly the
 * same thing renderer.js did in its own `PREVENT_DATA_LOADING_IN_SSR` fallback path.
 *
 * Trade-off: no more server-side rendering (worse for SEO / first paint) until we build a
 * real replacement. Given the goal is "kill Sharetribe now, rebuild clean," this is the
 * right trade for the moment - it can be revisited later.
 */

require('source-map-support').install();

// Configure process.env with .env.* files
require('./env').configureEnv();

const log = require('./log');

const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const enforceSsl = require('express-enforces-ssl');
const path = require('path');
const passport = require('passport');

const _ = require('lodash');

const auth = require('./auth');
const apiRouter = require('./apiRouter');
const robotsTxtRoute = require('./resources/robotsTxt');
const sitemapResourceRoute = require('./resources/sitemap');
const { generateCSPNonce, csp } = require('./csp');
const { ChunkExtractor } = require('@loadable/server');

const buildPath = path.resolve(__dirname, '..', 'build');
const dev = process.env.REACT_APP_ENV === 'development';
const PORT = parseInt(process.env.PORT, 10);
const REDIRECT_SSL = process.env.SERVER_SHARETRIBE_REDIRECT_SSL === 'true';
const TRUST_PROXY = process.env.SERVER_SHARETRIBE_TRUST_PROXY || null;
const CSP = process.env.REACT_APP_CSP;
const cspReportUrl = '/csp-report';
const cspEnabled = CSP === 'block' || CSP === 'report';

// Only things the NEW stack actually needs to boot. JWT_SECRET is required by
// server/utils/jwt.js anyway (it throws on first use if missing) - listing it here just
// gives a clear boot-time error instead of a confusing 500 on first login attempt.
// MONGODB_URI is deliberately NOT mandatory here: server/db/mongoose.js already degrades
// gracefully (routes return a clear 503) if it's unset, which is friendlier while we're
// still wiring things up.
const MANDATORY_ENV_VARIABLES = ['JWT_SECRET'];
const isEmpty = value => value == null || (value.hasOwnProperty('length') && value.length === 0);
const checkEnvVariables = variables => {
  const missingEnvVariables = variables.filter(v => isEmpty(process.env?.[v]));
  if (missingEnvVariables.length > 0) {
    console.error(`Required environment variable is not set: ${missingEnvVariables.join(', ')}`);
    process.exit(9);
  }
};
checkEnvVariables(MANDATORY_ENV_VARIABLES);

const app = express();

const errorPage500 = fs.readFileSync(path.join(buildPath, '500.html'), 'utf-8');
const errorPage404 = fs.readFileSync(path.join(buildPath, '404.html'), 'utf-8');
const indexHtmlPath = path.join(buildPath, 'index.html');
const rawIndexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

// Fill in build/index.html's `<!--!xxx-->` template placeholders (see the file header comment
// above for why this step is required, not optional). This mirrors server/renderer.js's own
// `template()` helper from the old SSR pipeline exactly, so the substitution syntax stays in
// sync with public/index.html - just without any Sharetribe/React rendering behind it.
const reNoMatch = /($^)/;
const templateWithHtmlAttributes = _.template(rawIndexHtml, {
  // <html data-htmlattr="htmlAttributes"> - substituted separately from the <!--!xxx--> tags
  // below because it lives inside a real HTML attribute, not a comment.
  interpolate: /data-htmlattr="([\s\S]+?)"/g,
  evaluate: reNoMatch,
  escape: reNoMatch,
});
const templateTags = templatedWithHtmlAttributes =>
  _.template(templatedWithHtmlAttributes, {
    // <!--!variableName--> placeholders - HTML comments so the raw file stays valid, inert HTML
    // even before substitution.
    interpolate: /<!--!([\s\S]+?)-->/g,
    evaluate: reNoMatch,
    escape: reNoMatch,
  });
const fillIndexHtmlTemplate = params => {
  const { htmlAttributes, ...tags } = params || {};
  const templated = templateWithHtmlAttributes({ htmlAttributes });
  return templateTags(templated)(tags);
};

// Built once at startup (the build output doesn't change while the process is running - same
// assumption errorPage500/errorPage404 above already make). No SSR happens here: htmlAttributes/
// title/link/meta/script/preloadedStateScript/body are all left empty on purpose, so the client
// always does a plain client-side render (src/index.js only calls hydrateRoot when
// window.__PRELOADED_STATE__ is present, which it never is here) rather than mismatching a
// hydration that never happened.
// Constructed directly (rather than via server/importer.js's getExtractors(), which also
// builds a "node" extractor off build/node/loadable-stats.json) so a missing/irrelevant node
// stats file - a leftover of the old SSR build - can never take down the one extractor this
// file actually needs.
let webExtractor = null;
try {
  webExtractor = new ChunkExtractor({
    statsFile: path.join(buildPath, 'loadable-stats.json'),
    outputPath: buildPath,
  });
} catch (e) {
  log.error(e, 'loadable-web-extractor-init-failed');
}

const renderIndexHtml = nonce => {
  if (!webExtractor) {
    // No extractor (e.g. build/loadable-stats.json missing) - fall back to the raw file rather
    // than crashing. Not ideal (no script tags will be filled in), but strictly no worse than
    // before this fix, and the error above makes the real cause visible in the logs.
    return rawIndexHtml;
  }
  const nonceParamMaybe = nonce ? { nonce } : {};
  return fillIndexHtmlTemplate({
    htmlAttributes: '',
    title: '',
    link: '',
    meta: '',
    script: '',
    preloadedStateScript: '',
    ssrStyles: webExtractor.getStyleTags(),
    ssrLinks: webExtractor.getLinkTags(),
    ssrScripts: webExtractor.getScriptTags(nonceParamMaybe),
    body: '',
  });
};

// Filter out bot requests scanning for php/wp vulnerabilities.
app.use(
  /.*(\.php|\.php7|\/wp-.*\/.*|cgi-bin.*|htdocs\.rar|htdocs\.zip|root\.7z|root\.rar|root\.zip|www\.7z|www\.rar|wwwroot\.7z)$/,
  (req, res) => res.status(404).send(errorPage404)
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'origin' },
  })
);

if (cspEnabled) {
  app.use(generateCSPNonce);
  app.use(bodyParser.json({ type: ['json', 'application/csp-report'] }));
  const reportOnly = CSP === 'report';
  app.use((req, res, next) => {
    csp(cspReportUrl, reportOnly)(req, res, next);
  });
}

if (REDIRECT_SSL) {
  app.use(enforceSsl());
}

if (TRUST_PROXY === 'true') {
  app.enable('trust proxy');
} else if (TRUST_PROXY === 'false') {
  app.disable('trust proxy');
} else if (TRUST_PROXY !== null) {
  app.set('trust proxy', TRUST_PROXY);
}

app.use(compression());
app.use(
  '/static',
  express.static(path.join(buildPath, 'static'), {
    setHeaders: (res, filePath) => {
      const isMain = filePath.match(
        /^\/.*static\/(js|css)\/main\.[a-z0-9]+\.(css|js|css\.map|js\.map)$/g
      );
      const isChunk = filePath.match(
        /^\/.*static\/(js|css)\/.*\.[a-z0-9]+\.chunk\.(css|js|css\.map|js\.map)$/g
      );
      const isMapboxSDK = filePath.match(
        /^\/.*static\/scripts\/mapbox\/mapbox-sdk@0.16.2\/mapbox-sdk\.min\.js$/g
      );
      if (isMain || isChunk || isMapboxSDK) {
        res.setHeader('Cache-Control', 'public, max-age=31557600');
      }
    },
  })
);
app.use(cookieParser());

app.get('/favicon.ico', (req, res) => {
  res.status(404).send('favicon.ico not found.');
});

app.get('/robots.txt', robotsTxtRoute);
app.get('/sitemap-:resource', sitemapResourceRoute);

// NOTE: /site.webmanifest used to be generated server-side from Sharetribe's branding.json
// asset. That call is gone along with Sharetribe, so the dynamic manifest route is removed
// for now. If a PWA manifest is needed again, serve a static one from /public instead.

if (!dev) {
  const USERNAME = process.env.BASIC_AUTH_USERNAME;
  const PASSWORD = process.env.BASIC_AUTH_PASSWORD;
  const hasUsername = typeof USERNAME === 'string' && USERNAME.length > 0;
  const hasPassword = typeof PASSWORD === 'string' && PASSWORD.length > 0;
  if (hasUsername && hasPassword) {
    app.use(auth.basicAuth(USERNAME, PASSWORD));
  }
}

app.use(passport.initialize());

// Server-side API routes (unchanged) - this is where all the real /v2 Mongo/Stripe
// endpoints live. Nothing here depends on Sharetribe credentials to boot.
app.use('/api', apiRouter);

const noCacheHeaders = {
  'Cache-control': 'no-cache, no-store, must-revalidate',
};

// Everything else: serve the SPA shell. The React app (client-rendered, no more SSR)
// takes over routing from here via src/routing/routeConfiguration.js.
app.get('/{*splat}', (req, res) => {
  if (req.url.startsWith('/static/')) {
    return res.status(404).send('Static asset not found.');
  }

  if (req.url === '/_status.json') {
    return res.status(200).send({ status: 'ok' });
  }

  res.set(noCacheHeaders);

  try {
    const html = renderIndexHtml(cspEnabled ? res.locals.cspNonce : null);
    return res.status(200).send(html);
  } catch (e) {
    log.error(e, 'index-html-render-failed');
    return res.status(500).send(errorPage500);
  }
});

log.setupExpressErrorHandler(app);

if (cspEnabled) {
  const reportValue = (req, key) => {
    const report = req.body ? req.body['csp-report'] : null;
    return report && report[key] ? report[key] : key;
  };
  app.post(cspReportUrl, (req, res) => {
    const effectiveDirective = reportValue(req, 'effective-directive');
    const blockedUri = reportValue(req, 'blocked-uri');
    const msg = `CSP: ${effectiveDirective} doesn't allow ${blockedUri}`;
    log.error(new Error(msg), 'csp-violation');
    res.status(204).end();
  });
}

const server = app.listen(PORT, () => {
  const mode = dev ? 'development' : 'production';
  console.log(`Listening to port ${PORT} in ${mode} mode`); // eslint-disable-line no-console
});

['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    console.log('Shutting down...'); // eslint-disable-line no-console
    server.close(() => {
      console.log('Server shut down.'); // eslint-disable-line no-console
    });
  });
});
