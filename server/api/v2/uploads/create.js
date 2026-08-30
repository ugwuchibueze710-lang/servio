/**
 * server/api/v2/uploads/create.js
 *
 * POST /api/v2/uploads (multipart/form-data: file=<the image>, purpose=<see below>) - a real
 * upload into MongoDB GridFS (server/utils/gridfs.js). Handles multer's own errors (wrong file
 * type, too large) as real, distinct 400s rather than a generic crash.
 *
 * purpose:
 *  - 'profile_image' / 'portfolio_image': public assets (spec sections 11/12) - anyone can view
 *    the resulting URL, matching how profile pictures/portfolios work everywhere else.
 *  - 'project_photo': attached while composing a new service request, before the Booking exists
 *    yet - stored private-to-uploader for now (see server/api/v2/uploads/get.js's authorization
 *    note for the known limitation here).
 *  - 'completion_evidence': REQUIRES an existing bookingId, and the uploader must be the
 *    business owner for that booking - checked against the real database, not trusted from the
 *    client.
 */
const Business = require('../../../models/Business');
const Booking = require('../../../models/Booking');
const { isConnected, connect } = require('../../../db/mongoose');
const { uploadBuffer } = require('../../../utils/gridfs');

const PUBLIC_PURPOSES = ['profile_image', 'portfolio_image'];
const PRIVATE_PURPOSES = ['project_photo', 'completion_evidence'];
const ALL_PURPOSES = [...PUBLIC_PURPOSES, ...PRIVATE_PURPOSES];

module.exports = async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'no_file', message: 'No file was uploaded (field name must be "file").' });
    return;
  }

  const { purpose, bookingId } = req.body || {};
  if (!ALL_PURPOSES.includes(purpose)) {
    res.status(400).json({
      error: 'invalid_purpose',
      message: `purpose must be one of: ${ALL_PURPOSES.join(', ')}.`,
    });
    return;
  }

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'database_unavailable',
      message: 'Uploads are not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  try {
    let linkedBookingId;
    if (purpose === 'completion_evidence') {
      if (!bookingId) {
        res.status(400).json({ error: 'missing_booking', message: 'completion_evidence requires a bookingId.' });
        return;
      }
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        res.status(404).json({ error: 'booking_not_found', message: 'This booking could not be found.' });
        return;
      }
      const business = await Business.findById(booking.business);
      if (!business || String(business.owner) !== String(req.appUser._id)) {
        res.status(403).json({
          error: 'not_authorized',
          message: 'Only the provider for this booking can upload completion evidence.',
        });
        return;
      }
      linkedBookingId = booking._id;
    }

    const isPublic = PUBLIC_PURPOSES.includes(purpose);
    const result = await uploadBuffer({
      buffer: req.file.buffer,
      filename: req.file.originalname || 'upload',
      contentType: req.file.mimetype,
      metadata: {
        uploadedBy: String(req.appUser._id),
        purpose,
        public: isPublic,
        bookingId: linkedBookingId ? String(linkedBookingId) : undefined,
      },
    });

    res.status(201).json({ id: result.id, url: `/api/v2/uploads/${result.id}` });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/uploads create] failed:', err.message);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
