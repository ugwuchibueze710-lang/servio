/**
 * Generates a downloadable invoice/receipt PDF for one completed SERVIO transaction.
 *
 * This is SERVIO's own, self-contained invoicing feature - the PDF generator (HTML templates,
 * mustache-style renderer, and the money/date formatting it depends on) was ported from Billzy,
 * a separate invoicing app on the operator's machine (C:\Users\Israel\Desktop\billzy). Billzy
 * itself is untouched; only its PDF-generation logic was copied and adapted (see
 * server/invoice/*.js and server/invoice/templates/*.html for what changed and why - the short
 * version is that Billzy's HTML->PDF engine, WeasyPrint, is a Python binary, and was swapped for
 * Puppeteer so this feature has no new system dependency on SERVIO's Render deploy).
 *
 * This is optional, on-demand invoicing, not part of the checkout flow: either the customer or the
 * provider on a transaction can generate one for their own records once that transaction has
 * actually been paid. No credentials or third-party account are required - unlike the previous
 * server/api/billzy.js integration point (which called out to a separate hosted Billzy account and
 * was disabled until BILLZY_API_URL/BILLZY_API_KEY were configured), this endpoint works out of the
 * box because the whole PDF generator now lives inside this app.
 *
 * Access control: getSdk(req, res) authenticates as the requesting browser's own logged-in user via
 * their session cookie, and Sharetribe's Marketplace API only returns a transaction to its own
 * customer or provider (or the marketplace operator) - so a user who isn't a party to `transactionId`
 * gets a 403 from the SDK call itself, not a hand-rolled check here.
 */
const { types } = require('sharetribe-flex-sdk');
const { getSdk, handleError } = require('../api-util/sdk');
const { buildInvoiceHtml } = require('../invoice/buildInvoiceHtml');
const { renderPdfFromHtml } = require('../invoice/renderPdf');
const { getTemplateById, DEFAULT_TEMPLATE_ID } = require('../invoice/templates');

const isEnabled = process.env.REACT_APP_INVOICE_PDF_ENABLED !== 'false'; // on by default

const findIncluded = (included, transaction, type) => {
  const ref = transaction.relationships && transaction.relationships[type];
  const refId = ref && ref.data && ref.data.id && ref.data.id.uuid;
  return included.find(i => i.type === type && i.id.uuid === refId);
};

const displayName = user =>
  (user && user.attributes && user.attributes.profile && user.attributes.profile.displayName) ||
  'SERVIO user';

// Sharetribe transaction line items use minor currency units (e.g. cents); Intl.NumberFormat
// (used by server/invoice/buildInvoiceHtml.js) expects major units.
const toMajorUnits = money => (money ? money.amount / 100 : 0);

module.exports = (req, res) => {
  if (!isEnabled) {
    return res.status(501).json({
      error: 'invoice-pdf-disabled',
      message: 'Invoice PDF downloads have been turned off on this marketplace (REACT_APP_INVOICE_PDF_ENABLED=false).',
    });
  }

  const { transactionId } = req.params;
  const templateId =
    typeof req.query.template === 'string' && getTemplateById(req.query.template)
      ? req.query.template
      : DEFAULT_TEMPLATE_ID;

  if (!transactionId) {
    return res.status(400).json({ error: 'missing-transaction-id' });
  }

  const sdk = getSdk(req, res);

  sdk.transactions
    .show({
      id: new types.UUID(transactionId),
      include: ['listing', 'customer', 'provider'],
    })
    .then(async response => {
      const transaction = response.data.data;
      const included = response.data.included || [];
      const listing = findIncluded(included, transaction, 'listing');
      const customer = findIncluded(included, transaction, 'customer');
      const provider = findIncluded(included, transaction, 'provider');

      const payinTotal = transaction.attributes.payinTotal;
      if (!payinTotal) {
        // Real gate, not a fake one: an invoice documents a payment that has actually happened.
        return res.status(409).json({
          error: 'transaction-not-paid',
          message: 'This transaction has not been paid yet, so there is nothing to invoice.',
        });
      }

      const currency = payinTotal.currency;
      const lineItems = (transaction.attributes.lineItems || []).filter(
        li => !li.reversal && Array.isArray(li.includeFor) && li.includeFor.includes('customer')
      );

      const items =
        lineItems.length > 0
          ? lineItems.map(li => ({
              description: (li.code || 'line-item').replace(/^line-item\//, '').replace(/-/g, ' '),
              quantity: li.quantity ? Number(li.quantity) : li.units ? Number(li.units) : 1,
              unitPrice: toMajorUnits(li.unitPrice),
              lineTotal: toMajorUnits(li.lineTotal),
            }))
          : [
              {
                description: (listing && listing.attributes && listing.attributes.title) || 'Service',
                quantity: 1,
                unitPrice: toMajorUnits(payinTotal),
                lineTotal: toMajorUnits(payinTotal),
              },
            ];

      const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
      const shortId = transactionId.replace(/-/g, '').slice(-8).toUpperCase();

      const invoice = {
        invoiceNumber: `SRV-${shortId}`,
        issueDate: transaction.attributes.lastTransitionedAt || transaction.attributes.createdAt,
        currency,
        status: 'paid',
        customer: {
          name: displayName(customer),
          email: null, // Sharetribe's public profile does not expose email addresses to this endpoint
        },
        items,
        subtotal,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        total: toMajorUnits(payinTotal),
        notes: (listing && listing.attributes && listing.attributes.title) || undefined,
      };

      const settings = {
        companyName: displayName(provider),
      };

      const html = buildInvoiceHtml(invoice, settings, templateId);
      const pdfBuffer = await renderPdfFromHtml(html);

      res
        .status(200)
        .set('Content-Type', 'application/pdf')
        .set('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`)
        .send(pdfBuffer);
    })
    .catch(e => {
      if (e && e.status) {
        return res.status(e.status).json({ error: 'invoice-pdf-failed', message: e.message });
      }
      handleError(res, e);
    });
};
