/**
 * Renders an HTML invoice to a PDF buffer.
 *
 * Billzy (the standalone app this feature is ported from) shells out to WeasyPrint, a Python
 * binary, to turn HTML/CSS into a PDF. That's a fine choice for a self-hosted desktop-ish app, but
 * it's a poor fit for SERVIO's deploy target (a plain Node web service on Render, built with
 * `yarn install && yarn build` - no Python, no apt-get, no Dockerfile) - adding a Python runtime and
 * a system binary as a hard dependency would make the whole marketplace app fail to build if that
 * binary isn't present, for a feature that's supposed to be optional.
 *
 * Puppeteer (a Node package that drives a bundled, self-contained Chromium build) renders the exact
 * same HTML/CSS with no new system dependency beyond what `yarn install` already downloads, so it's
 * the direct swap for WeasyPrint that keeps this feature 100% self-contained in the existing
 * Node/Express deploy. See DEPLOYMENT.md for the one operational caveat (Chromium's shared-library
 * requirements on some minimal Linux hosts) and the graceful fallback below.
 *
 * The browser instance is a lazily-created singleton reused across requests (launching a fresh
 * Chromium per PDF would add ~1-2s of pure startup latency to every invoice download).
 */
const log = require('../log');

let browserPromise = null;
let puppeteer = null;

function loadPuppeteer() {
  if (!puppeteer) {
    // Required lazily so a marketplace that never installs/updates this optional dependency
    // (or whose host can't launch Chromium at all) doesn't crash on server startup - only the
    // invoice-pdf request path is affected, and it fails with a clear, catchable error instead.
    puppeteer = require('puppeteer');
  }
  return puppeteer;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = loadPuppeteer()
      .launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })
      .catch(e => {
        // Don't cache a rejected launch - the next request should retry (the host might recover,
        // e.g. after a transient resource limit).
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

/**
 * @param {string} html - fully-rendered invoice HTML (see server/invoice/buildInvoiceHtml.js)
 * @returns {Promise<Buffer>}
 */
async function renderPdfFromHtml(html) {
  let browser;
  try {
    browser = await getBrowser();
  } catch (e) {
    log.error(e, 'invoice-pdf-chromium-launch-failed');
    const err = new Error(
      'PDF rendering is temporarily unavailable on this server (the PDF engine could not start). ' +
        'See DEPLOYMENT.md for the Chromium/Puppeteer deployment notes.'
    );
    err.status = 503;
    throw err;
  }

  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return pdfBuffer;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { renderPdfFromHtml };
