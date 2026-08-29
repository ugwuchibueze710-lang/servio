const fs = require('fs');
const path = require('path');

/**
 * The four built-in invoice PDF layouts, ported verbatim (HTML/CSS unchanged) from Billzy
 * (C:\Users\Israel\Desktop\billzy, backend/static/templates/*.html). Loaded once at server start.
 */
const TEMPLATE_FILES = [
  { id: 'professional-modern', name: 'Professional Modern', file: 'professional-modern.html' },
  { id: 'minimalist-clean', name: 'Minimalist Clean', file: 'minimalist-clean.html' },
  { id: 'nova', name: 'Nova', file: 'nova.html' },
  { id: 'slate', name: 'Slate', file: 'slate.html' },
];

const TEMPLATES = TEMPLATE_FILES.map(t => ({
  id: t.id,
  name: t.name,
  html: fs.readFileSync(path.join(__dirname, t.file), 'utf8'),
}));

const DEFAULT_TEMPLATE_ID = 'professional-modern';

const getTemplateById = id => TEMPLATES.find(t => t.id === id);
const getDefaultTemplate = () => getTemplateById(DEFAULT_TEMPLATE_ID);

module.exports = { TEMPLATES, DEFAULT_TEMPLATE_ID, getTemplateById, getDefaultTemplate };
