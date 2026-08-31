/**
 * src/containers/BookingRequestPageV2/BookingRequestPageV2.js
 *
 * Real request form for a specific provider, reached at /book-v2/:businessId (e.g. from a
 * "Request booking" link on ProviderSearchPageV2 or ProviderPublicProfilePageV2). Spec section
 * 17's "detailed customer service requests": description, real photos (uploaded to GridFS, not
 * just staged in memory), preferred date, budget, and - when the provider has structured
 * services/pricing set up - a specific service picker showing the real quoted price upfront.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import LocationControl from '../../components/LocationControl/LocationControl';
import PhotoUploader from '../../components/PhotoUploader/PhotoUploader';
import { hasAppUserToken } from '../../util/apiV2';
import { fetchBusinessV2Thunk, createBookingV2Thunk } from './BookingRequestPageV2.duck';

import css from './BookingRequestPageV2.module.css';

const formatPrice = service => {
  switch (service.pricingType) {
    case 'fixed':
      return `$${service.fixedPrice}`;
    case 'starting_at':
      return `Starting at $${service.fixedPrice}`;
    case 'range':
      return `$${service.priceMin}–$${service.priceMax}`;
    case 'hourly':
      return `$${service.hourlyRate}/hr`;
    case 'per_unit':
      return `$${service.fixedPrice}${service.unitLabel ? ` / ${service.unitLabel}` : ''}`;
    case 'request_quote':
    default:
      return 'Request a quote';
  }
};

const emptyForm = {
  categorySlug: '',
  serviceId: '',
  description: '',
  requestedDate: '',
  requestedTimeNote: '',
  budgetNote: '',
  additionalNotes: '',
};

const BookingRequestPageV2 = props => {
  const { businessId } = props.params || {};
  const dispatch = useDispatch();
  const history = useHistory();
  const page = useSelector(state => state.BookingRequestPageV2);
  const [form, setForm] = useState(emptyForm);
  const [location, setLocation] = useState({});
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    if (!hasAppUserToken()) {
      history.push(`/auth-v2?returnTo=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (businessId) {
      dispatch(fetchBusinessV2Thunk(businessId));
    }
  }, [dispatch, businessId, history]);

  useEffect(() => {
    if (page.business && !form.categorySlug && page.business.categories?.length) {
      setForm(prev => ({ ...prev, categorySlug: page.business.categories[0].slug }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.business]);

  useEffect(() => {
    if (page.createdBooking) {
      history.push(`/booking-v2/${page.createdBooking._id}`);
    }
  }, [page.createdBooking, history]);

  const handleField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const servicesForCategory = useMemo(() => {
    if (!page.business?.services) return [];
    const category = (page.business.categories || []).find(c => c.slug === form.categorySlug);
    if (!category) return [];
    return page.business.services.filter(
      s => s.active !== false && String(s.category) === String(category._id)
    );
  }, [page.business, form.categorySlug]);

  const handleCategoryChange = slug => {
    setForm(prev => ({ ...prev, categorySlug: slug, serviceId: '' }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    const body = {
      businessId,
      categorySlug: form.categorySlug,
      serviceId: form.serviceId || undefined,
      description: form.description,
      locationLabel: location.label || undefined,
      requestedDate: form.requestedDate || undefined,
      requestedTimeNote: form.requestedTimeNote || undefined,
      budgetNote: form.budgetNote || undefined,
      additionalNotes: form.additionalNotes || undefined,
      photos: photos.map(p => ({ url: p.url })),
    };
    if (location.lat != null && location.lng != null) {
      body.lat = location.lat;
      body.lng = location.lng;
    }
    dispatch(createBookingV2Thunk(body));
  };

  if (page.fetchBusinessInProgress) {
    return (
      <>
        <TopbarContainer currentPage="BookingRequestPageV2" />
        <div className={css.root}>
          <p>Loading provider...</p>
        </div>
      </>
    );
  }

  if (page.fetchBusinessError || !page.business) {
    return (
      <>
        <TopbarContainer currentPage="BookingRequestPageV2" />
        <div className={css.root}>
          <p className={css.errorText}>This provider could not be found.</p>
        </div>
      </>
    );
  }

  const { business } = page;

  return (
    <>
      <TopbarContainer currentPage="BookingRequestPageV2" />
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
            onChange={e => handleCategoryChange(e.target.value)}
            required
          >
            {(business.categories || []).map(cat => (
              <option key={cat.slug} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </select>
        </label>

        {servicesForCategory.length > 0 && (
          <label className={css.label}>
            Specific service (optional - shows real pricing)
            <select
              className={css.input}
              value={form.serviceId}
              onChange={e => handleField('serviceId', e.target.value)}
            >
              <option value="">Not sure / general request</option>
              {servicesForCategory.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} - {formatPrice(s)}
                </option>
              ))}
            </select>
          </label>
        )}

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

        <div className={css.label}>
          Photos (optional - helps the provider quote accurately)
          <PhotoUploader purpose="project_photo" value={photos} onChange={setPhotos} />
        </div>

        <div className={css.label}>
          Where is this?
          <LocationControl value={location} onChange={setLocation} lockable={false} showRadius={false} label="" />
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
    </>
  );
};

export default BookingRequestPageV2;
