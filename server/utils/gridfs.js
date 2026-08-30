/**
 * server/utils/gridfs.js
 *
 * Real, persistent file storage using MongoDB GridFS - chosen specifically because it needs no
 * credential beyond the MONGODB_URI this app already requires, unlike S3/Cloudinary/etc, which
 * the product spec explicitly says should not be needed (only Groq/Mapbox/Stripe credentials).
 * Used for profile pictures, portfolio images, project photos, and completion evidence - never
 * ephemeral local disk, which would be wiped on every Render redeploy/restart.
 */
const { mongoose, isConnected } = require('../db/mongoose');

const BUCKET_NAME = 'uploads';
let bucket = null;

const getBucket = () => {
  if (!isConnected()) {
    return null;
  }
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET_NAME });
  }
  return bucket;
};

/**
 * Streams a real in-memory buffer (from multer memoryStorage) into GridFS.
 * @returns {Promise<{ id: string, filename: string }>}
 */
const uploadBuffer = ({ buffer, filename, contentType, metadata }) =>
  new Promise((resolve, reject) => {
    const b = getBucket();
    if (!b) {
      reject(new Error('gridfs_not_connected'));
      return;
    }
    const uploadStream = b.openUploadStream(filename, { contentType, metadata });
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve({ id: String(uploadStream.id), filename }));
    uploadStream.end(buffer);
  });

/** Opens a real download stream for a stored file, or null if it doesn't exist / isn't connected. */
const openDownloadStream = fileId => {
  const b = getBucket();
  if (!b) return null;
  try {
    return b.openDownloadStream(new mongoose.Types.ObjectId(fileId));
  } catch (err) {
    return null;
  }
};

/** Real file metadata lookup (content type, our own metadata, size) - not guessed from the URL. */
const findFile = async fileId => {
  const b = getBucket();
  if (!b) return null;
  let objectId;
  try {
    objectId = new mongoose.Types.ObjectId(fileId);
  } catch (err) {
    return null;
  }
  const files = await b.find({ _id: objectId }).toArray();
  return files[0] || null;
};

const deleteFile = async fileId => {
  const b = getBucket();
  if (!b) throw new Error('gridfs_not_connected');
  await b.delete(new mongoose.Types.ObjectId(fileId));
};

module.exports = { getBucket, uploadBuffer, openDownloadStream, findFile, deleteFile };
