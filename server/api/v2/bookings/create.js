/**
 * server/api/v2/bookings/create.js
 *
 * POST /api/v2/bookings - a customer's real service request to a specific Business. Verifies the
 * business actually exists, is active, and actually offers the requested category (a customer
 * can't request "plumbing" from a business that only registered under "cleaning") before ever
 * writing a Booking row.
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const Category = require('../../../models/Category');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const {
    businessId,
    categorySlug,
    description,
    locationLabel,
    lat,
    lng,
    requestedDate,
    requestedTimeNote,
    budgetNote,
    additionalNotes,
    photos,
  } = req.body || {};

  const trimmedDescription = typeof description === 'string' ? description.trim() : '';
  if (!businessId || typeof businessId !== 'string') {
    res.status(400).json({ error: 'missing_business', message: 'A businessId is required.' });
    return;
  }
  if (!categorySlug || typeof categorySlug !== 'string') {
    res.status(400).json({ error: 'missing_category', message: 'A categorySlug is required.' });
    return;
  }
  if (trimmedDescription.length < 10) {
    res.status(400).json({
      error: 'invalid_description',
      message: 'Please describe what you need (at least 10 characters).',
    });
    return;
  }

  let parsedDate;
  if (requestedDate !== undefined) {
    parsedDate = new Date(requestedDate);
    if (Number.isNaN(parsedDate.getTime())) {
      res.status(400).json({ error: 'invalid_date', message: 'requestedDate is not a valid date.' });
      return;
    }
  }

  let latNum;
  let lngNum;
  if (lat !== undefined || lng !== undefined) {
    latNum = Number(lat);
    lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      res.status(400).json({ error: 'invalid_location', message: 'Location coordinates are invalid.' });
      return;
    }
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'booking_database_unavailable',
      message: 'Booking requests are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    const business = await Business.findById(businessId);
    if (!business || !business.active) {
      res
        .status(404)
        .json({ error: 'business_not_found', message: 'This business could not be found.' });
      return;
    }

    const category = await Category.findOne({ slug: categorySlug, active: true });
    if (!category) {
      res
        .status(400)
        .json({ error: 'unknown_category', message: `No such category: ${categorySlug}` });
      return;
    }

    const offersCategory = (business.categories || []).some(id => String(id) === String(category._id));
    if (!offersCategory) {
      res.status(400).json({
        error: 'category_not_offered',
        message: 'This business does not offer that category of service.',
      });
      return;
    }

    const booking = await Booking.create({
      customer: req.appUser._id,
      business: business._id,
      category: category._id,
      description: trimmedDescription,
      photos: Array.isArray(photos) ? photos.filter(p => p && typeof p.url === 'string') : [],
      location: latNum !== undefined ? { type: 'Point', coordinates: [lngNum, latNum] } : undefined,
      locationLabel: typeof locationLabel === 'string' ? locationLabel.trim() : undefined,
      requestedDate: parsedDate,
      requestedTimeNote: typeof requestedTimeNote === 'string' ? requestedTimeNote.trim() : undefined,
      budgetNote: typeof budgetNote === 'string' ? budgetNote.trim() : undefined,
      additionalNotes: typeof additionalNotes === 'string' ? additionalNotes.trim() : undefined,
    });

    res.status(201).json({ booking });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/bookings create] failed:', err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
