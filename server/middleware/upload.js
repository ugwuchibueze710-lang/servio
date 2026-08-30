/**
 * server/middleware/upload.js
 *
 * Shared multer config for real file uploads (spec: "Real File Uploads" section). Uses
 * memoryStorage - files are held as an in-memory buffer just long enough to stream straight into
 * GridFS (server/utils/gridfs.js), never written to local disk (which is ephemeral on Render).
 * Real validation: only actual image mimetypes, capped at 8MB - not a placeholder that accepts
 * anything.
 */
const multer = require('multer');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const err = new Error('unsupported_file_type');
      err.code = 'unsupported_file_type';
      cb(err);
      return;
    }
    cb(null, true);
  },
});

module.exports = { upload, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES };
