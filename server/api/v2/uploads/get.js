/**
 * server/api/v2/uploads/get.js
 *
 * GET /api/v2/uploads/:id - streams a real file back from GridFS (server/utils/gridfs.js).
 * Public uploads (profile/portfolio images) are served to anyone, matching how those assets work
 * everywhere else. Private uploads (project photos, completion evidence) require a signed-in
 * AppUser who is either the uploader, or (once a completion_evidence file is linked to a real
 * bookingId - see create.js) a party to that booking - checked against the actual database, not
 * trusted from the client. Mounted with optionalAuth so public files don't force a login.
 *
 * KNOWN LIMITATION: a 'project_photo' attached while composing a new request (before the Booking
 * exists) has no bookingId yet, so today only its uploader can view it. Once the booking that
 * references it is created, task #39's request-detail view should re-check authorization the
 * same way messages.js does, rather than relying on this endpoint alone - flagged here rather
 * than silently left as a gap.
 */
const Business = require('../../../models/Business');
const Booking = require('../../../models/Booking');
const { isConnected, connect } = require('../../../db/mongoose');
const { findFile, openDownloadStream } = require('../../../utils/gridfs');

module.exports = async (req, res) => {
  const { id } = req.params;

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
    const file = await findFile(id);
    if (!file) {
      res.status(404).json({ error: 'not_found', message: 'This file could not be found.' });
      return;
    }

    const meta = file.metadata || {};
    if (!meta.public) {
      const requesterId = req.appUser ? String(req.appUser._id) : null;
      let authorized = requesterId && requesterId === meta.uploadedBy;

      if (!authorized && requesterId && meta.bookingId) {
        const booking = await Booking.findById(meta.bookingId);
        if (booking) {
          const business = await Business.findById(booking.business);
          authorized =
            String(booking.customer) === requesterId ||
            (business && String(business.owner) === requesterId);
        }
      }

      if (!authorized) {
        res.status(403).json({ error: 'forbidden', message: 'You are not authorized to view this file.' });
        return;
      }
    }

    const stream = openDownloadStream(id);
    if (!stream) {
      res.status(404).json({ error: 'not_found', message: 'This file could not be found.' });
      return;
    }

    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Cache-Control', meta.public ? 'public, max-age=31557600' : 'private, no-store');
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(404).json({ error: 'not_found', message: 'This file could not be found.' });
      }
    });
    stream.pipe(res);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/uploads get] failed:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
    }
  }
};
