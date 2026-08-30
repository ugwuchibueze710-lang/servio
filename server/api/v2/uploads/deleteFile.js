/**
 * server/api/v2/uploads/deleteFile.js
 *
 * DELETE /api/v2/uploads/:id - real deletion from GridFS (server/utils/gridfs.js). Covers the
 * spec's "Deletion/replacement where appropriate" for uploads (section 38): a provider removing
 * a portfolio image, replacing a profile picture, or a customer removing a project photo they
 * attached to a not-yet-submitted request. Authorization is checked against the file's own
 * stored metadata.uploadedBy - only the original uploader may delete it. "Replacement" itself is
 * just delete-old + upload-new from the client (two real, independent operations), rather than a
 * separate in-place-overwrite endpoint, since GridFS files are immutable by design.
 */
const { isConnected, connect } = require('../../../db/mongoose');
const { findFile, deleteFile } = require('../../../utils/gridfs');

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
    const requesterId = String(req.appUser._id);
    if (meta.uploadedBy !== requesterId) {
      res.status(403).json({ error: 'forbidden', message: 'You are not authorized to delete this file.' });
      return;
    }

    await deleteFile(id);
    res.status(200).json({ id, deleted: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/v2/uploads delete] failed:', err.message);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  }
};
