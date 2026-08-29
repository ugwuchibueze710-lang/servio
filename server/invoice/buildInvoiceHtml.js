/**
 * Builds the invoice HTML for one SERVIO transaction, ready to hand to a PDF renderer.
 *
 * The context-building logic (money/date formatting, postal/city line ordering, hex-color
 * lightening for the template accent color, mustache-context shape) is ported from Billzy
 * (C:\Users\Israel\Desktop\billzy, backend/src/utils/pdf.ts, functions `buildContext` and
 * `buildInvoiceHTML`), trimmed of the parts that don't apply to SERVIO:
 *   - Billzy stores multi-currency, multi-locale, per-line-tax invoices edited by hand; SERVIO
 *     invoices are always generated from one real, already-paid Sharetribe transaction, so there's
 *     no draft/sent/overdue lifecycle, no manual per-invoice currency override, and (at launch)
 *     English-only labels.
 *   - Logo resolution here only ever receives a data: URI (SERVIO's own logo, inlined once at
 *     startup) or nothing - never a remote/local-file lookup - since SERVIO doesn't let providers
 *     upload a business logo (yet).
 */
const { renderTemplate } = require('./renderTemplate');
const labels = require('./labels');
const { getTemplateById, getDefaultTemplate } = require('./templates');

function normalizeHex(hex) {
  if (!hex) return undefined;
  const h = hex.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(h)) return h.startsWith('#') ? h : `#${h}`;
  return undefined;
}

function lighten(hex, amount = 0.85) {
  const n = normalizeHex(hex) || '#0e7490';
  const m = n.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const mix = c => Math.round(c + (255 - c) * amount);
  const rr = mix(r)
    .toString(16)
    .padStart(2, '0');
  const gg = mix(g)
    .toString(16)
    .padStart(2, '0');
  const bb = mix(b)
    .toString(16)
    .padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

function escapeHtmlWithBreaks(value) {
  const str = value === undefined || value === null ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '<br />');
}

const CITY_FIRST_POSTAL_COUNTRIES = new Set(['US', 'GB', 'BR', 'AU', 'CA', 'NZ', 'IE', 'MX']);

function formatPostalCityLine(postalCode, city, countryCode) {
  const postal = (postalCode || '').trim();
  const place = (city || '').trim();
  if (!postal && !place) return undefined;
  if (!postal) return place;
  if (!place) return postal;
  const country = (countryCode || '').trim().toUpperCase();
  if (CITY_FIRST_POSTAL_COUNTRIES.has(country)) {
    return `${place} ${postal}`;
  }
  return `${postal} ${place}`;
}

function formatDate(d, format = 'YYYY-MM-DD') {
  if (!d) return undefined;
  const date = typeof d === 'string' ? new Date(`${d}T00:00:00`) : new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  if (format === 'DD.MM.YYYY') {
    return `${day}.${month}.${year}`;
  }
  return `${year}-${month}-${day}`;
}

function formatMoney(value, currency, numberFormat = 'comma') {
  const locale = numberFormat === 'period' ? 'de-DE' : 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

/**
 * @param {Object} invoice - see server/api/invoice-pdf.js for the shape this is built with
 *   (invoiceNumber, issueDate, currency, status, customer{...}, items[], subtotal, taxAmount,
 *   taxRate, discountAmount, total, notes, paymentTerms).
 * @param {Object} settings - company/provider-side display info (companyName, companyEmail, ...)
 *   plus an optional `logoDataUri`.
 */
function buildContext(invoice, settings = {}) {
  const currency = invoice.currency || 'USD';
  const companyPostalCity = formatPostalCityLine(
    settings.companyPostalCode,
    settings.companyCity,
    settings.companyCountryCode
  );

  return {
    companyName: settings.companyName || 'SERVIO Provider',
    companyAddress: escapeHtmlWithBreaks(settings.companyAddress || ''),
    companyPostalCity,
    companyEmail: settings.companyEmail || '',
    companyPhone: settings.companyPhone || '',
    companyTaxId: settings.companyTaxId || '',

    invoiceNumber: invoice.invoiceNumber,
    issueDate: formatDate(invoice.issueDate),
    dueDate: undefined, // SERVIO invoices document an already-completed payment; there is no due date
    currency,
    status: invoice.status || 'paid',

    customerName: invoice.customer.name,
    customerContactName: undefined,
    customerEmail: invoice.customer.email,
    customerPhone: undefined,
    customerAddress: undefined,
    customerPostalCity: undefined,
    customerCountryCode: undefined,
    customerTaxId: undefined,

    items: invoice.items.map(i => ({
      description: i.description,
      quantity: i.quantity,
      unitPrice: formatMoney(i.unitPrice, currency),
      lineTotal: formatMoney(i.lineTotal, currency),
    })),
    hasItemUnits: false,

    subtotal: formatMoney(invoice.subtotal, currency),
    discountAmount: invoice.discountAmount > 0 ? formatMoney(invoice.discountAmount, currency) : undefined,
    hasDiscount: invoice.discountAmount > 0,
    taxRate: invoice.taxRate || undefined,
    taxAmount: invoice.taxAmount > 0 ? formatMoney(invoice.taxAmount, currency) : undefined,
    hasTax: invoice.taxAmount > 0,
    taxSummary: undefined,
    hasTaxSummary: false,
    total: formatMoney(invoice.total, currency),

    paymentTerms: undefined,
    paymentMethods: 'Paid by card via Stripe',
    bankAccount: undefined,
    notes: invoice.notes || undefined,

    locale: 'en',
    labels,

    logoUrl: settings.logoDataUri || undefined,
    brandLogoLeft: true,
  };
}

function buildInvoiceHtml(invoice, settings, templateId) {
  const ctx = buildContext(invoice, settings);
  const hl = normalizeHex(settings && settings.highlightColor) || '#0e7490'; // SERVIO brand color
  const hlLight = lighten(hl, 0.86);

  const template = (templateId && getTemplateById(templateId)) || getDefaultTemplate();
  if (!template) {
    throw new Error('No invoice templates available.');
  }

  return renderTemplate(template.html, {
    ...ctx,
    highlightColor: hl,
    highlightColorLight: hlLight,
  });
}

module.exports = { buildInvoiceHtml, buildContext };
