/**
 * src/components/PhotoUploader/PhotoUploader.js
 *
 * A real, reusable multi-image uploader against the actual GridFS-backed upload endpoints
 * (server/api/v2/uploads/*.js) - no fake preview-only "attach" UI that doesn't actually persist
 * anything. Used for request photos, completion evidence, and portfolio images (spec sections
 * 17, 33, 12) by passing the right `purpose` (and `bookingId` when the purpose requires one).
 * Each accepted file is uploaded immediately (not just staged for a later batch send) so what the
 * user sees reflects what is actually stored.
 *
 * @param {string} props.purpose - 'project_photo' | 'completion_evidence' | 'profile_image' | 'portfolio_image'
 * @param {string} [props.bookingId] - required for 'completion_evidence'
 * @param {Array<{id, url}>} props.value
 * @param {(next: Array<{id, url}>) => void} props.onChange
 * @param {number} [props.max]
 */
import React, { useRef, useState } from 'react';
import { ensureAppUserToken } from '../../util/apiV2';
import { apiBaseUrl } from '../../util/api';
import css from './PhotoUploader.module.css';

const MAX_DEFAULT = 8;

const uploadOne = (file, purpose, bookingId) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', purpose);
  if (bookingId) formData.append('bookingId', bookingId);

  // Multipart requests can't go through apiV2's JSON-only jsonRequest helper (it always sets
  // Content-Type: application/json and JSON.stringifies the body) - this does its own real fetch
  // with the same bearer-token auth convention instead.
  return apiV2Multipart('/api/v2/uploads', formData);
};

const apiV2Multipart = async (path, formData) => {
  const token = await ensureAppUserToken();
  const res = await window.fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || 'Upload failed');
    error.status = res.status;
    throw error;
  }
  return data;
};

const PhotoUploader = ({ purpose, bookingId, value = [], onChange, max = MAX_DEFAULT }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file
    if (files.length === 0) return;
    if (value.length + files.length > max) {
      setError(`You can upload up to ${max} photos.`);
      return;
    }

    setUploading(true);
    setError(null);
    const uploaded = [];
    for (const file of files) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await uploadOne(file, purpose, bookingId);
        uploaded.push({ id: result.id, url: result.url });
      } catch (err) {
        setError(err.message || 'A photo failed to upload. Please try again.');
      }
    }
    setUploading(false);
    if (uploaded.length > 0) {
      onChange([...value, ...uploaded]);
    }
  };

  const removePhoto = id => {
    onChange(value.filter(p => p.id !== id));
  };

  return (
    <div className={css.root}>
      <div className={css.grid}>
        {value.map(photo => (
          <div key={photo.id} className={css.thumbWrapper}>
            <img className={css.thumb} src={photo.url} alt="Uploaded" />
            <button type="button" className={css.removeButton} onClick={() => removePhoto(photo.id)} aria-label="Remove photo">
              ×
            </button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" className={css.addButton} onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : '+ Add photo'}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFiles}
      />
      {error && <p className={css.errorText}>{error}</p>}
    </div>
  );
};

export default PhotoUploader;
