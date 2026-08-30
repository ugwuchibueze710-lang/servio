/**
 * src/containers/BookingRequestPageV2/BookingRequestPageV2.js
 *
 * Real request form for a specific provider, reached at /book-v2/:businessId (e.g. from a
 * "Request booking" link on ProviderSearchPageV2's results). See the .duck.js header for why
 * GET /api/v2/providers/:id exists now - this page needs to work on a direct visit/refresh, not
 * only when arriving from search results with data already in memory.
 */
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { userLocation } from '../../util/maps';
import { fetchBusinessV2Thunk, createBookingV2Thunk } from './BookingRequestPageV2.duck';

import css from './BookingRequestPageV2.module.css';

const emptyForm = {
  categorySlug: '',
  description: '',
  locationLabel: '',
  lat: null,
  lng: null,
  requestedDate: '',
  requestedTimeNote: '',
  budgetNote: '',
  additionalNotes: '',
};

// Receives `params` the same way ServiceCategoryPage.js / ProviderSearchPageV2.js do - see
// src/routing/Routes.js's `params={match.params}`.
const BookingRequestPageV2 = props => {
  const { businessId } = props.params || {};
  const dispatch = useDispatch();
  const history = useHistory();
  const page = useSelector(state => state.BookingRequestPageV2);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (businessId) {
      dispatch(fetchBusinessV2Thunk(businessId));
    }
  }, [dispatch, businessId]);

  useEffect(() => {
    if (page.business && !form.categorySlug && page.business.categories?.length) {
      setForm(prev => ({ ...prev, categorySlug: page.business.categories[0].slug }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.business]);

  useEffect(() => {
    if (page.createdBooking) {
      history.push('/my-bookings-v2');
    }
  }, [page.createdBooking, history]);

  const handleField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleUseCurrentLocation = () => {
    userLocation()
      .then(latlng => {
        handleField('lat', latlng.lat);
        handleField('lng', latlng.lng);
      })
      .catch(() => {
        // Real failure mode (denied/unavailable geolocation) - the request can still be sent
        // without a precise location; locationLabel (typed by hand) still goes through.
      });
  };

  const handleSubmit = e => {
    e.preventDefault();
    const body = {
      businessId,
      categorySlug: form.categorySlug,
      description: form.description,
      locationLabel: form.locationLabel || undefined,
      requestedDate: form.requestedDate || undefined,
      requestedTimeNote: form.requestedTimeNote || undefined,
      budgetNote: form.budgetNote || undefined,
      additionalNotes: form.additionalNotes || undefined,
    };
    if (form.lat != null && form.lng != null) {
      body.lat = form.lat;
      body.lng = form.lng;
    }
    dispatch(createBookingV2Thunk(body));
  };

  if (page.fetchBusinessInProgress) {
    return (
      <div className={css.root}>
        <p>Loading provider...</p>
      </div>
    );
  }

  if (page.fetchBusinessError || !page.business) {
    return (
      <div className={css.root}>
        <p className={css.errorText}>This provider could not be found.</p>
      </div>
    );
  }

  const { business } = page;

  return (
    <div className={css.root}>
      <h1 className={css.title}>Request {business.name}</h1>
      <p className={css.bio}>{business.bio}</p>

      {page.createError && (
        <p className={css.errorText}>
          {page.createError.message || 'Something went wrong sending your request. Please try again.'}
        </p>
      )}

      <form onSubmit={handleSubmit} className={css.form}>
        <label className={css.label}>
          What do you need?
          <select
            className={css.input}
            value={form.categorySlug}
            onChange={e => handleField('categorySlug', e.target.value)}
            required
          >
            {(business.categories || []).map(cat => (
              <option key={cat.slug} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </select>
        </label>

        <label className={css.label}>
          Describe what you need (10+ characters)
          <textarea
            className={css.textarea}
            value={form.description}
            onChange={e => handleField('description', e.target.value)}
            required
            minLength={10}
          />
        </label>

        <label className={css.label}>
          Location (e.g. "123 Main St, Boston")
          <input
            className={css.input}
            type="text"
            value={form.locationLabel}
            onChange={e => handleField('locationLabel', e.target.value)}
          />
        </label>

        <div className={css.locationRow}>
          <button type="button" className={css.secondaryButton} onClick={handleUseCurrentLocation}>
            Use my current location
          </button>
          {form.lat != null && (
            <span className={css.locationLabel}>
              {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
            </span>
          )}
        </div>

        <label className={css.label}>
          Preferred date
          <input
            className={css.input}
            type="date"
            value={form.requestedDate}
            onChange={e => handleField('requestedDate', e.target.value)}
          />
        </label>

        <label className={css.label}>
          Preferred time
          <input
            className={css.input}
            type="text"
            placeholder="e.g. Weekday mornings"
            value={form.requestedTimeNote}
            onChange={e => handleField('requestedTimeNote', e.target.value)}
          />
        </label>

        <label className={css.label}>
          Budget (optional)
          <input
            className={css.input}
            type="text"
            placeholder="e.g. Under $200"
            value={form.budgetNote}
            onChange={e => handleField('budgetNote', e.target.value)}
          />
        </label>

        <label className={css.label}>
          Anything else the provider should know?
          <textarea
            className={css.textarea}
            value={form.additionalNotes}
            onChange={e => handleField('additionalNotes', e.target.value)}
          />
        </label>

        <button type="submit" className={css.primaryButton} disabled={page.createInProgress}>
          {page.createInProgress ? 'Sending request...' : 'Send request'}
        </button>
      </form>
    </div>
  );
};

export default BookingRequestPageV2;
