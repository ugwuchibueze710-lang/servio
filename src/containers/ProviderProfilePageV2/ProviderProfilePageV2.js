/**
 * src/containers/ProviderProfilePageV2/ProviderProfilePageV2.js
 *
 * Provider onboarding/editing (spec sections 18, 11, 12, 28, 32): business basics, structured
 * per-service pricing (never a single vague "pricing varies"), the real "Accepting New Jobs"
 * gate, whether to publish a phone number, portfolio images, and real Stripe Connect onboarding
 * (payouts only ever happen once Stripe itself confirms the account is ready - never faked).
 * A logged-in user with no Business record yet sees a real, empty form; someone who already has
 * one sees it populated for editing.
 */
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { NamedLink } from '../../components';
import LocationControl from '../../components/LocationControl/LocationControl';
import PhotoUploader from '../../components/PhotoUploader/PhotoUploader';
import { hasAppUserToken } from '../../util/apiV2';
import {
  fetchCategoriesV2Thunk,
  fetchMyProviderV2Thunk,
  upsertProviderV2Thunk,
  connectOnboardV2Thunk,
  connectStatusV2Thunk,
  clearSavedJustNowV2,
} from './ProviderProfilePageV2.duck';

import css from './ProviderProfilePageV2.module.css';

const PRICING_TYPES = [
  { value: 'fixed', label: 'Fixed price' },
  { value: 'starting_at', label: 'Starting at' },
  { value: 'range', label: 'Price range' },
  { value: 'hourly', label: 'Hourly rate' },
  { value: 'per_unit', label: 'Per unit' },
  { value: 'request_quote', label: 'Request a quote' },
];

const emptyForm = {
  name: '',
  bio: '',
  categorySlugs: [],
  serviceAreaLabel: '',
  serviceRadiusMiles: 15,
  contactPhone: '',
  publishPhone: false,
  acceptingNewJobs: true,
  availabilityNote: '',
};

const emptyService = () => ({
  key: Math.random().toString(36).slice(2),
  category: '',
  name: '',
  description: '',
  pricingType: 'fixed',
  fixedPrice: '',
  priceMin: '',
  priceMax: '',
  hourlyRate: '',
  unitLabel: '',
});

const ProviderProfilePageV2 = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const page = useSelector(state => state.ProviderProfilePageV2);
  const [form, setForm] = useState(emptyForm);
  const [serviceLocation, setServiceLocation] = useState({});
  const [services, setServices] = useState([]);
  const [profileImage, setProfileImage] = useState([]);
  const [portfolioImages, setPortfolioImages] = useState([]);
  const [signedIn, setSignedIn] = useState(null);

  useEffect(() => {
    setSignedIn(hasAppUserToken());
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    dispatch(fetchCategoriesV2Thunk());
    dispatch(fetchMyProviderV2Thunk());
    const params = new URLSearchParams(location.search);
    if (params.get('stripe')) {
      dispatch(connectStatusV2Thunk());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, signedIn]);

  useEffect(() => {
    if (!page.business) return;
    const b = page.business;
    setForm({
      name: b.name || '',
      bio: b.bio || '',
      categorySlugs: (b.categories || []).map(c => c.slug),
      serviceAreaLabel: b.serviceAreaLabel || '',
      serviceRadiusMiles: b.serviceRadiusMiles || 15,
      contactPhone: b.contactPhone || '',
      publishPhone: !!b.publishPhone,
      acceptingNewJobs: b.acceptingNewJobs !== false,
      availabilityNote: b.availabilityNote || '',
    });
    if (b.location?.coordinates) {
      setServiceLocation({
        lat: b.location.coordinates[1],
        lng: b.location.coordinates[0],
        label: b.serviceAreaLabel || '',
      });
    }
    setServices(
      (b.services || []).map(s => ({
        key: s._id || Math.random().toString(36).slice(2),
        category: (b.categories || []).find(c => String(c._id) === String(s.category))?.slug || '',
        name: s.name || '',
        description: s.description || '',
        pricingType: s.pricingType || 'fixed',
        fixedPrice: s.fixedPrice ?? '',
        priceMin: s.priceMin ?? '',
        priceMax: s.priceMax ?? '',
        hourlyRate: s.hourlyRate ?? '',
        unitLabel: s.unitLabel || '',
      }))
    );
    if (b.profileImageUrl) setProfileImage([{ id: 'existing', url: b.profileImageUrl }]);
    setPortfolioImages((b.portfolioImages || []).map((img, i) => ({ id: `existing-${i}`, url: img.url })));
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

  const addService = () => setServices(prev => [...prev, emptyService()]);
  const removeService = key => setServices(prev => prev.filter(s => s.key !== key));
  const updateService = (key, field, value) =>
    setServices(prev => prev.map(s => (s.key === key ? { ...s, [field]: value } : s)));

  const handleSubmit = e => {
    e.preventDefault();
    dispatch(clearSavedJustNowV2());

    const categoryBySlug = Object.fromEntries((page.business?.categories || []).map(c => [c.slug, c._id]));
    // A brand-new profile hasn't been saved yet, so its own categories aren't populated on
    // page.business - fall back to matching against the categories list itself in that case.
    const categoryIdFor = slug =>
      categoryBySlug[slug] || page.categories.find(c => c.slug === slug)?._id;

    const body = {
      name: form.name,
      bio: form.bio,
      categorySlugs: form.categorySlugs,
      serviceAreaLabel: serviceLocation.label || form.serviceAreaLabel || undefined,
      serviceRadiusMiles: form.serviceRadiusMiles,
      availabilityNote: form.availabilityNote || undefined,
      contactPhone: form.contactPhone || undefined,
      publishPhone: form.publishPhone,
      acceptingNewJobs: form.acceptingNewJobs,
      profileImageUrl: profileImage[0]?.url || undefined,
      portfolioImages: portfolioImages.map(img => ({ url: img.url })),
      services: services
        .filter(s => s.name.trim() && s.category)
        .map(s => ({
          category: categoryIdFor(s.category),
          name: s.name.trim(),
          description: s.description.trim() || undefined,
          pricingType: s.pricingType,
          fixedPrice: s.fixedPrice !== '' ? Number(s.fixedPrice) : undefined,
          priceMin: s.priceMin !== '' ? Number(s.priceMin) : undefined,
          priceMax: s.priceMax !== '' ? Number(s.priceMax) : undefined,
          hourlyRate: s.hourlyRate !== '' ? Number(s.hourlyRate) : undefined,
          unitLabel: s.unitLabel.trim() || undefined,
        }))
        .filter(s => !!s.category),
    };
    if (serviceLocation.lat != null && serviceLocation.lng != null) {
      body.lat = serviceLocation.lat;
      body.lng = serviceLocation.lng;
    }
    dispatch(upsertProviderV2Thunk(body));
  };

  const handleConnectOnboard = () => {
    dispatch(connectOnboardV2Thunk()).then(result => {
      if (result.meta.requestStatus === 'fulfilled' && result.payload?.url) {
        window.location.href = result.payload.url;
      }
    });
  };

  if (signedIn === null) {
    return <div className={css.root} />;
  }

  if (!signedIn) {
    return (
      <div className={css.root}>
        <h1 className={css.title}>Set up your provider profile</h1>
        <p className={css.errorText}>
          You need to sign in first. <NamedLink name="AuthenticationPageV2">Sign in</NamedLink>
        </p>
      </div>
    );
  }

  return (
    <div className={css.root}>
      <h1 className={css.title}>{page.business ? 'Edit your provider profile' : 'Set up your provider profile'}</h1>

      {page.savedJustNow && <p className={css.successText}>Saved.</p>}
      {page.saveError && <p className={css.errorText}>{page.saveError.message || 'Something went wrong saving. Please try again.'}</p>}

      <form onSubmit={handleSubmit} className={css.form}>
        <label className={css.label}>
          Business name
          <input className={css.input} type="text" value={form.name} onChange={e => handleField('name', e.target.value)} required />
        </label>

        <label className={css.label}>
          Description (20+ characters)
          <textarea className={css.textarea} value={form.bio} onChange={e => handleField('bio', e.target.value)} required minLength={20} />
        </label>

        <div className={css.label}>
          Profile photo
          <PhotoUploader purpose="profile_image" value={profileImage} onChange={imgs => setProfileImage(imgs.slice(-1))} max={1} />
        </div>

        <fieldset className={css.fieldset}>
          <legend>Categories</legend>
          {page.fetchCategoriesInProgress && <p>Loading categories...</p>}
          {page.categories.filter(cat => !cat.isRideCategory).map(cat => (
            <label key={cat.slug} className={css.checkboxLabel}>
              <input type="checkbox" checked={form.categorySlugs.includes(cat.slug)} onChange={() => handleToggleCategory(cat.slug)} />
              {cat.name}
            </label>
          ))}
        </fieldset>

        <fieldset className={css.fieldset}>
          <legend>Services & pricing</legend>
          {services.map(s => (
            <div key={s.key} className={css.serviceEditorRow}>
              <select className={css.input} value={s.category} onChange={e => updateService(s.key, 'category', e.target.value)}>
                <option value="">Category…</option>
                {form.categorySlugs.map(slug => {
                  const cat = page.categories.find(c => c.slug === slug);
                  return cat ? <option key={slug} value={slug}>{cat.name}</option> : null;
                })}
              </select>
              <input className={css.input} type="text" placeholder="Service name" value={s.name} onChange={e => updateService(s.key, 'name', e.target.value)} />
              <input className={css.input} type="text" placeholder="Description (optional)" value={s.description} onChange={e => updateService(s.key, 'description', e.target.value)} />
              <select className={css.input} value={s.pricingType} onChange={e => updateService(s.key, 'pricingType', e.target.value)}>
                {PRICING_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </select>
              {(s.pricingType === 'fixed' || s.pricingType === 'starting_at') && (
                <input className={css.input} type="number" min="0" placeholder="Price ($)" value={s.fixedPrice} onChange={e => updateService(s.key, 'fixedPrice', e.target.value)} />
              )}
              {s.pricingType === 'range' && (
                <>
                  <input className={css.input} type="number" min="0" placeholder="Min ($)" value={s.priceMin} onChange={e => updateService(s.key, 'priceMin', e.target.value)} />
                  <input className={css.input} type="number" min="0" placeholder="Max ($)" value={s.priceMax} onChange={e => updateService(s.key, 'priceMax', e.target.value)} />
                </>
              )}
              {s.pricingType === 'hourly' && (
                <input className={css.input} type="number" min="0" placeholder="Rate ($/hr)" value={s.hourlyRate} onChange={e => updateService(s.key, 'hourlyRate', e.target.value)} />
              )}
              {s.pricingType === 'per_unit' && (
                <>
                  <input className={css.input} type="number" min="0" placeholder="Price ($)" value={s.fixedPrice} onChange={e => updateService(s.key, 'fixedPrice', e.target.value)} />
                  <input className={css.input} type="text" placeholder="Unit (e.g. sq ft)" value={s.unitLabel} onChange={e => updateService(s.key, 'unitLabel', e.target.value)} />
                </>
              )}
              <button type="button" className={css.removeServiceButton} onClick={() => removeService(s.key)}>Remove</button>
            </div>
          ))}
          <button type="button" className={css.secondaryButton} onClick={addService}>+ Add a service</button>
        </fieldset>

        <div className={css.label}>
          Portfolio photos
          <PhotoUploader purpose="portfolio_image" value={portfolioImages} onChange={setPortfolioImages} max={12} />
        </div>

        <label className={css.label}>
          Service area (e.g. "Greater Boston")
          <LocationControl value={serviceLocation} onChange={setServiceLocation} lockable={false} showRadius={false} label="" />
        </label>

        <label className={css.label}>
          Service radius (miles)
          <input className={css.input} type="number" min={1} max={200} value={form.serviceRadiusMiles} onChange={e => handleField('serviceRadiusMiles', Number(e.target.value))} />
        </label>

        <label className={css.label}>
          Contact phone
          <input className={css.input} type="tel" value={form.contactPhone} onChange={e => handleField('contactPhone', e.target.value)} />
        </label>
        <label className={css.checkboxLabel}>
          <input type="checkbox" checked={form.publishPhone} onChange={e => handleField('publishPhone', e.target.checked)} />
          Show my phone number on my public profile
        </label>

        <label className={css.checkboxLabel}>
          <input type="checkbox" checked={form.acceptingNewJobs} onChange={e => handleField('acceptingNewJobs', e.target.checked)} />
          Accepting new jobs right now
        </label>

        <label className={css.label}>
          Availability note
          <input className={css.input} type="text" value={form.availabilityNote} onChange={e => handleField('availabilityNote', e.target.value)} />
        </label>

        <button type="submit" className={css.primaryButton} disabled={page.saveInProgress}>
          {page.saveInProgress ? 'Saving...' : 'Save profile'}
        </button>
      </form>

      {page.business && (
        <section className={css.stripeSection}>
          <h2 className={css.sectionTitle}>Payouts</h2>
          {page.connectStatus?.payoutsEnabled ? (
            <p className={css.successText}>Stripe Connect is set up - you can receive payouts.</p>
          ) : (
            <>
              <p className={css.detail}>
                Set up Stripe Connect to receive payouts when customers pay for completed jobs.
              </p>
              <button type="button" className={css.primaryButton} onClick={handleConnectOnboard} disabled={page.connectOnboardInProgress}>
                {page.connectOnboardInProgress ? 'Redirecting…' : 'Set up payouts with Stripe'}
              </button>
            </>
          )}
          {page.connectOnboardError && <p className={css.errorText}>Something went wrong. Please try again.</p>}
        </section>
      )}
    </div>
  );
};

export default ProviderProfilePageV2;
