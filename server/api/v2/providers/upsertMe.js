/**
 * server/api/v2/providers/upsertMe.js
 *
 * POST /api/v2/providers/me - creates or updates the authenticated AppUser's Business (provider)
 * profile. Real validation throughout: unknown category slugs are rejected outright (never
 * silently dropped), a duplicate business name gets a real unique-slug retry loop instead of a
 * fake "success", and the account's `roles` array gets a genuine database write adding
 * 'provider' the first time someone completes this - no separate "become a provider" signup flow
 * (spec section 18).
 */
const Business = require('../../../models/Business');
const Category = require('../../../models/Category');
const { isConnected, connect } = require('../../../db/mongoose');
const { slugify } = require('../../../utils/slugify');

const MAX_SLUG_ATTEMPTS = 20;

module.exports = async (req, res) => {
  const {
    name,
    bio,
    categorySlugs,
    serviceAreaLabel,
    serviceRadiusMiles,
    lat,
    lng,
    pricingNote,
    availabilityNote,
    contactPhone,
    profileImageUrl,
  } = req.body || {};

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  const trimmedBio = typeof bio === 'string' ? bio.trim() : '';
  const slugs = Array.isArray(categorySlugs)
    ? categorySlugs.filter(s => typeof s === 'string' && s.trim())
    : [];

  if (!trimmedName || trimmedName.length < 2) {
    res.status(400).json({ error: 'invalid_name', message: 'Business name is required.' });
    return;
  }
  if (!trimmedBio || trimmedBio.length < 20) {
    res.status(400).json({
      error: 'invalid_bio',
      message: 'Please write at least a short description (20+ characters) of your business.',
    });
    return;
  }
  if (slugs.length === 0) {
    res
      .status(400)
      .json({ error: 'missing_categories', message: 'Select at least one service category.' });
    return;
  }

  let latNum;
  let lngNum;
  if (lat !== undefined || lng !== undefined) {
    latNum = Number(lat);
    lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      res
        .status(400)
        .json({ error: 'invalid_location', message: 'Location coordinates are invalid.' });
      return;
    }
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'provider_database_unavailable',
      message: 'Provider profiles are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const categoryDocs = await Category.find({ slug: { $in: slugs }, active: true }).select('_id slug');
    const foundSlugs = new Set(categoryDocs.map(c => c.slug));
    const unknown = slugs.filter(s => !foundSlugs.has(s));
    if (unknown.length > 0) {
      res.status(400).json({
        error: 'unknown_categories',
        message: `Unknown categor${unknown.length === 1 ? 'y' : 'ies'}: ${unknown.join(', ')}`,
      });
      return;
    }

    const update = {
      name: trimmedName,
      bio: trimmedBio,
      categories: categoryDocs.map(c => c._id),
    };
    if (serviceAreaLabel !== undefined) update.serviceAreaLabel = String(serviceAreaLabel).trim();
    if (serviceRadiusMiles !== undefined) {
      const radius = Number(serviceRadiusMiles);
      if (Number.isFinite(radius)) update.serviceRadiusMiles = Math.min(Math.max(radius, 1), 200);
    }
    if (latNum !== undefined) update.location = { type: 'Point', coordinates: [lngNum, latNum] };
    if (pricingNote !== undefined) update.pricingNote = String(pricingNote).trim();
    if (availabilityNote !== undefined) update.availabilityNote = String(availabilityNote).trim();
    if (contactPhone !== undefined) update.contactPhone = String(contactPhone).trim();
    if (profileImageUrl !== undefined) update.profileImageUrl = String(profileImageUrl).trim();

    let business = await Business.findOne({ owner: req.appUser._id });
    let created = false;

    if (business) {
      Object.assign(business, update);
      await business.save();
    } else {
      const baseSlug = slugify(trimmedName);
      let candidateSlug = baseSlug;
      let attempt = 0;
      while (await Business.findOne({ slug: candidateSlug })) {
        attempt += 1;
        candidateSlug = `${baseSlug}-${attempt + 1}`;
        if (attempt > MAX_SLUG_ATTEMPTS) {
          res.status(500).json({
            error: 'internal_error',
            message: 'Could not generate a unique profile URL. Please try a different business name.',
          });
          return;
        }
      }
      business = await Business.create({ ...update, owner: req.appUser._id, slug: candidateSlug });
      created = true;
    }

    if (!req.appUser.roles.includes('provider')) {
      req.appUser.roles.push('provider');
      await req.appUser.save();
    }

    const populated = await business.populate('categories', 'name slug');
    res.status(created ? 201 : 200).json({ business: populated });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/providers/me POST] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
