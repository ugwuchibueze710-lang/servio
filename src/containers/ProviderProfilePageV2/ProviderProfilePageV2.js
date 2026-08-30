/**
 * src/containers/ProviderProfilePageV2/ProviderProfilePageV2.js
 *
 * Create/edit screen for a provider's Business profile on the new backend. A logged-in Sharetribe
 * user with no Business record yet sees a real, empty form (not fake pre-filled sample data);
 * someone who already has one sees it populated for editing. See the .duck.js header for why this
 * is a new, parallel screen rather than a change to any existing page.
 */
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { userLocation } from '../../util/maps';
import {
  fetchCategoriesV2Thunk,
  fetchMyProviderV2Thunk,
  upsertProviderV2Thunk,
  clearSavedJustNowV2,
} from './ProviderProfilePageV2.duck';

import css from './ProviderProfilePageV2.module.css';

const emptyForm = {
  name: '',
  bio: '',
  categorySlugs: [],
  serviceAreaLabel: '',
  serviceRadiusMiles: 15,
  lat: null,
  lng: null,
  pricingNote: '',
  availabilityNote: '',
  contactPhone: '',
};

const ProviderProfilePageV2 = () => {
  const dispatch = useDispatch();
  const page = useSelector(state => state.ProviderProfilePageV2);
  const [form, setForm] = useState(emptyForm);
  const [locationLabel, setLocationLabel] = useState(null);

  useEffect(() => {
    dispatch(fetchCategoriesV2Thunk());
    dispatch(fetchMyProviderV2Thunk());
  }, [dispatch]);

  // Once the existing profile loads, populate the form from it (edit mode) - only runs once per
  // successful fetch, so it never stomps on changes the person is actively typing.
  useEffect(() => {
    if (!page.business) return;
    const b = page.business;
    setForm({
      name: b.name || '',
      bio: b.bio || '',
      categorySlugs: (b.categories || []).map(c => c.slug),
      serviceAreaLabel: b.serviceAreaLabel || '',
      serviceRadiusMiles: b.serviceRadiusMiles || 15,
      lat: b.location?.coordinates?.[1] ?? null,
      lng: b.location?.coordinates?.[0] ?? null,
      pricingNote: b.pricingNote || '',
      availabilityNote: b.availabilityNote || '',
      contactPhone: b.contactPhone || '',
    });
    if (b.location?.coordinates) {
      setLocationLabel(`${b.location.coordinates[1].toFixed(4)}, ${b.location.coordinates[0].toFixed(4)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.business]);

  const handleField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleToggleCategory = slug => {
    setForm(prev => ({
      ...prev,
      categorySlugs: prev.categorySlugs.includes(slug)
        ? prev.categorySlugs.filter(s => s !== slug)
        : [...prev.categorySlugs, slug],
    }));
  };

  const handleUseCurrentLocation = () => {
    userLocation()
      .then(latlng => {
        handleField('lat', latlng.lat);
        handleField('lng', latlng.lng);
        setLocationLabel(`${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`);
      })
      .catch(() => {
        // Real failure mode (denied/unavailable geolocation) - the profile can still be saved
        // without a location; search-by-distance just won't include it until one is set.
      });
  };

  const handleSubmit = e => {
    e.preventDefault();
    dispatch(clearSavedJustNowV2());
    const body = {
      name: form.name,
      bio: form.bio,
      categorySlugs: form.categorySlugs,
      serviceAreaLabel: form.serviceAreaLabel || undefined,
      serviceRadiusMiles: form.serviceRadiusMiles,
      pricingNote: form.pricingNote || undefined,
      availabilityNote: form.availabilityNote || undefined,
      contactPhone: form.contactPhone || undefined,
    };
    if (form.lat != null && form.lng != null) {
      body.lat = form.lat;
      body.lng = form.lng;
    }
    dispatch(upsertProviderV2Thunk(body));
  };

  return (
    <div className={css.root}>
      <h1 className={css.title}>{page.business ? 'Edit your provider profile' : 'Set up your provider profile'}</h1>

      {page.savedJustNow && <p className={css.successText}>Saved.</p>}
      {page.saveError && <p className={css.errorText}>{page.saveError.message || 'Something went wrong saving. Please try again.'}</p>}

      <form onSubmit={handleSubmit} className={css.form}>
        <label className={css.label}>
          Business name
          <input
            className={css.input}
            type="text"
            value={form.name}
            onChange={e => handleField('name', e.target.value)}
            required
          />
        </label>

        <label className={css.label}>
          Description (20+ characters)
          <textarea
            className={css.textarea}
            value={form.bio}
            onChange={e => handleField('bio', e.target.value)}
            required
            minLength={20}
          />
        </label>

        <fieldset className={css.fieldset}>
          <legend>Categories</legend>
          {page.fetchCategoriesInProgress && <p>Loading categories...</p>}
          {/* Ride is handled by a separate driver onboarding flow (Driver model, not Business) -
              see MIGRATION_PLAN.md - so it's excluded here rather than offered as a nonsensical
              checkbox for, say, a plumber to tick. */}
          {page.categories.filter(cat => !cat.isRideCategory).map(cat => (
            <label key={cat.slug} className={css.checkboxLabel}>
              <input
                type="checkbox"
                checked={form.categorySlugs.includes(cat.slug)}
                onChange={() => handleToggleCategory(cat.slug)}
              />
              {cat.name}
            </label>
          ))}
        </fieldset>

        <label className={css.label}>
          Service area (e.g. "Greater Boston")
          <input
            className={css.input}
            type="text"
            value={form.serviceAreaLabel}
            onChange={e => handleField('serviceAreaLabel', e.target.value)}
          />
        </label>

        <label className={css.label}>
          Service radius (miles)
          <input
            className={css.input}
            type="number"
            min={1}
            max={200}
            value={form.serviceRadiusMiles}
            onChange={e => handleField('serviceRadiusMiles', Number(e.target.value))}
          />
        </label>

        <div className={css.locationRow}>
          <button type="button" className={css.secondaryButton} onClick={handleUseCurrentLocation}>
            Use my current location
          </button>
          {locationLabel && <span className={css.locationLabel}>{locationLabel}</span>}
        </div>

        <label className={css.label}>
          Contact phone
          <input
            className={css.input}
            type="tel"
            value={form.contactPhone}
            onChange={e => handleField('contactPhone', e.target.value)}
          />
        </label>

        <label className={css.label}>
          Pricing note
          <input
            className={css.input}
            type="text"
            value={form.pricingNote}
            onChange={e => handleField('pricingNote', e.target.value)}
          />
        </label>

        <label className={css.label}>
          Availability note
          <input
            className={css.input}
            type="text"
            value={form.availabilityNote}
            onChange={e => handleField('availabilityNote', e.target.value)}
          />
        </label>

        <button type="submit" className={css.primaryButton} disabled={page.saveInProgress}>
          {page.saveInProgress ? 'Saving...' : 'Save profile'}
        </button>
      </form>
    </div>
  );
};

export default ProviderProfilePageV2;
