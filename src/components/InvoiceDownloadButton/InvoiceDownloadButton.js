import React, { useState } from 'react';
import { string } from 'prop-types';

import { FormattedMessage } from '../../util/reactIntl';
import { invoicePdfUrl, INVOICE_PDF_TEMPLATES } from '../../util/api';

import css from './InvoiceDownloadButton.module.css';

const isInvoicePdfEnabled = process.env.REACT_APP_INVOICE_PDF_ENABLED !== 'false';

/**
 * Optional "Download invoice (PDF)" action for a paid transaction.
 *
 * Drop this into TransactionPage (or anywhere else a customer or provider views a transaction
 * they've already paid for) once payment has actually happened - see TransactionPage.js, where it
 * only renders once `transaction.attributes.payinTotal` is set. Either party can download their own
 * copy; the actual PDF is generated on demand by `server/api/invoice-pdf.js`, so this component
 * itself just links to that endpoint and offers a choice of visual style.
 *
 * @component
 * @param {Object} props
 * @param {string} props.transactionId - UUID of the paid transaction
 * @param {string} [props.className]
 */
const InvoiceDownloadButton = ({ transactionId, className }) => {
  const [templateId, setTemplateId] = useState(INVOICE_PDF_TEMPLATES[0].id);

  if (!isInvoicePdfEnabled || !transactionId) {
    return null;
  }

  return (
    <div className={className}>
      <a
        className={css.button}
        href={invoicePdfUrl(transactionId, templateId)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <FormattedMessage id="InvoiceDownloadButton.download" />
      </a>
      {INVOICE_PDF_TEMPLATES.length > 1 ? (
        <label className={css.styleLabel}>
          <FormattedMessage id="InvoiceDownloadButton.styleLabel" />
          <select
            className={css.styleSelect}
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
          >
            {INVOICE_PDF_TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
};

InvoiceDownloadButton.propTypes = {
  transactionId: string.isRequired,
  className: string,
};

export default InvoiceDownloadButton;
