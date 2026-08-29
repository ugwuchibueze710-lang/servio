/**
 * A small, dependency-free Mustache-like HTML template renderer.
 *
 * Ported (near-verbatim logic) from Billzy (the standalone invoicing app at
 * C:\Users\Israel\Desktop\billzy on the operator's machine, backend/src/controllers/templates.ts,
 * function `renderTemplate`), converted from Deno/TypeScript to plain CommonJS so it can run
 * directly in SERVIO's Node/Express server with zero new runtime dependencies.
 *
 * Supports:
 *   {{var}}                 - HTML-escaped value
 *   {{{var}}}               - raw (unescaped) value, e.g. multi-line addresses with <br />
 *   {{#section}}...{{/section}} - repeated block for arrays, or shown once when value is truthy
 *   {{var || 'default'}}    - fallback literal when var is empty/undefined
 */

function escapeHtml(value) {
  const str = value === undefined || value === null ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lookup(obj, path) {
  const clean = path.trim().replace(/^['"]|['"]$/g, '');
  return clean.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return acc[key];
    }
    return undefined;
  }, obj);
}

function merge(a, b) {
  return { ...a, ...b };
}

function renderBlocks(tpl, ctx) {
  const blockRe = /\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  let result = tpl;
  let match;
  while ((match = blockRe.exec(result)) !== null) {
    const [full, rawKey, inner] = match;
    const key = rawKey.trim();
    const val = lookup(ctx, key);
    let replacement = '';
    if (Array.isArray(val)) {
      replacement = val
        .map(item => renderAll(inner, merge(ctx, item || {})))
        .join('');
    } else if (val) {
      replacement = renderAll(inner, ctx);
    } else {
      replacement = '';
    }
    result = result.slice(0, match.index) + replacement + result.slice(match.index + full.length);
    blockRe.lastIndex = 0; // reset after modifying the string
  }
  return result;
}

function renderVars(tpl, ctx) {
  return tpl.replace(/\{\{([^}]+)\}\}/g, (m, raw) => {
    const key = String(raw).trim();
    if (key.startsWith('#') || key.startsWith('/')) return m; // skip block tags
    if (key.includes('||')) {
      const [lhs, rhs] = key.split('||').map(s => s.trim());
      const val = lookup(ctx, lhs.replace(/['"]/g, ''));
      if (val === undefined || val === null || val === '') {
        return escapeHtml(rhs.replace(/^['"]|['"]$/g, ''));
      }
      return escapeHtml(val);
    }
    const v = lookup(ctx, key);
    return v !== undefined && v !== null ? escapeHtml(v) : '';
  });
}

function renderTriple(tpl, ctx) {
  const tripleRe = /\{\{\{([^}]+)\}\}\}/g;
  return tpl.replace(tripleRe, (_m, raw) => {
    const key = String(raw).trim();
    const val = lookup(ctx, key);
    return val === undefined || val === null ? '' : String(val);
  });
}

function renderAll(tpl, ctx) {
  const withBlocks = renderBlocks(tpl, ctx);
  const withTriple = renderTriple(withBlocks, ctx);
  return renderVars(withTriple, ctx);
}

const renderTemplate = (templateHtml, data) => renderAll(templateHtml, data);

module.exports = { renderTemplate, escapeHtml };
