/**
 * server/utils/slugify.js
 *
 * Shared slug helper. Used for Business.slug (a provider's public profile URL segment) - kept
 * generic/dependency-free so any future model needing a slug (e.g. admin-managed content) can
 * reuse it rather than re-implementing the same regex differently in each file.
 */
const slugify = input => {
  const slug = String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || 'business';
};

module.exports = { slugify };
