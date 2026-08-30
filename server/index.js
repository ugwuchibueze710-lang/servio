/**
 * This is the main server to run the production application.
 *
 * REWRITTEN to drop Sharetribe entirely:
 *  - No more MANDATORY_ENV_VARIABLES check on Sharetribe SDK credentials at boot.
 *  - No more custom server-side rendering pipeline (dataLoader/renderer/sdkUtils), which
 *    used to call the Sharetribe SDK on every single page request. That coupling is exactly
 *    what made the whole site crash/500 the moment Sharetribe credentials were removed.
 *  - Instead: a plain static file server that serves the React build as a client-rendered
 *    single-page app. The already-working /v2/* Mongo/Stripe backend (server/apiRouter.js)
 *    is untouched and mounted exactly as before at /api.
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

const auth = require('./auth');
const apiRouter = require('./apiRouter');
const robotsTxtRoute = require('./resources/robotsTxt');
const sitemapResourceRoute = require('./resources/sitemap');
const { generateCSPNonce, csp } = require('./csp');

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

  fs.readFile(indexHtmlPath, 'utf-8', (err, html) => {
    if (err) {
      log.error(err, 'index-html-read-failed');
      return res.status(500).send(errorPage500);
    }
    return res.status(200).send(html);
  });
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
