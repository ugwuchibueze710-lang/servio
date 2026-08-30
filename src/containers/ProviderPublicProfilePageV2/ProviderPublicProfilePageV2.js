/**
 * src/containers/ProviderPublicProfilePageV2/ProviderPublicProfilePageV2.js
 *
 * The real, public provider profile a customer sees before requesting a job (spec sections 11,
 * 12, 20): portfolio images, structured per-service pricing (never a single vague "pricing
 * varies"), real reviews tied only to confirmed/paid_out jobs, a save/favorite heart, and a
 * phone-dialer link ONLY when the provider chose to publish their number. No pay-per-lead
 * gating here - any signed-in customer can request this provider for free; the platform only
 * ever earns via the transaction fee on a completed job (spec differentiator #1).
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { apiV2, hasAppUserToken } from '../../util/apiV2';
import { fetchProviderProfileV2Thunk } from './ProviderPublicProfilePageV2.duck';

import css from './ProviderPublicProfilePageV2.module.css';

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

const ProviderPublicProfilePageV2 = props => {
  const { businessId } = props.params || {};
  const dispatch = useDispatch();
  const page = useSelector(state => state.ProviderPublicProfilePageV2);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (businessId) dispatch(fetchProviderProfileV2Thunk({ businessId }));
  }, [dispatch, businessId]);

  useEffect(() => {
    if (hasAppUserToken()) {
      apiV2('/api/v2/auth/me')
        .then(data => setSaved((data.user?.savedProviders || []).map(String).includes(String(businessId))))
        .catch(() => {});
    }
  }, [businessId]);

  const toggleSave = () => {
    if (!hasAppUserToken()) {
      window.location.href = `/auth-v2?returnTo=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    const method = saved ? 'DELETE' : 'POST';
    setSaved(!saved);
    apiV2(`/api/v2/me/saved-providers/${businessId}`, { method }).catch(() => setSaved(saved));
  };

  if (page.fetchInProgress) {
    return <div className={css.root}><p>Loading…</p></div>;
  }
  if (page.fetchError || !page.business) {
    return (
      <div className={css.root}>
        <p className={css.errorText}>This provider could not be found.</p>
      </div>
    );
  }

  const { business, reviews } = page;

  return (
    <div className={css.root}>
      <div className={css.header}>
        <div className={css.headerMain}>
          {business.profileImageUrl && (
            <img className={css.avatar} src={business.profileImageUrl} alt={business.name} />
          )}
          <div>
            <h1 className={css.name}>{business.name}</h1>
            {business.ratingCount > 0 ? (
              <p className={css.rating}>
                {business.ratingAvg.toFixed(1)} ★ ({business.ratingCount} review{business.ratingCount === 1 ? '' : 's'})
              </p>
            ) : (
              <p className={css.ratingNew}>New provider - no reviews yet</p>
            )}
            {business.serviceAreaLabel && <p className={css.detail}>Serves {business.serviceAreaLabel}</p>}
            <p className={css.detail}>
              {business.acceptingNewJobs ? 'Currently accepting new jobs' : 'Not accepting new jobs right now'}
            </p>
          </div>
        </div>
        <div className={css.headerActions}>
          <button type="button" className={saved ? css.saveButtonActive : css.saveButton} onClick={toggleSave}>
            {saved ? '♥ Saved' : '♡ Save'}
          </button>
          {business.acceptingNewJobs && (
            <Link className={css.requestButton} to={`/book-v2/${business._id}`}>
              Request this provider
            </Link>
          )}
          {business.publishPhone && business.contactPhone && (
            <a className={css.phoneLink} href={`tel:${business.contactPhone}`}>
              Call {business.contactPhone}
            </a>
          )}
        </div>
      </div>

      <section className={css.section}>
        <h2 className={css.sectionTitle}>About</h2>
        <p className={css.bio}>{business.bio}</p>
      </section>

      {business.services?.length > 0 && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Services & pricing</h2>
          <ul className={css.serviceList}>
            {business.services.filter(s => s.active !== false).map(service => (
              <li key={service._id} className={css.serviceRow}>
                <div>
                  <p className={css.serviceName}>{service.name}</p>
                  {service.description && <p className={css.serviceDescription}>{service.description}</p>}
                </div>
                <p className={css.servicePrice}>{formatPrice(service)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {business.portfolioImages?.length > 0 && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Portfolio</h2>
          <div className={css.portfolioGrid}>
            {business.portfolioImages.map((img, i) => (
              <img key={i} className={css.portfolioImage} src={img.url} alt={img.caption || business.name} />
            ))}
          </div>
        </section>
      )}

      <section className={css.section}>
        <h2 className={css.sectionTitle}>
          Reviews {reviews.length > 0 ? `(${reviews.length})` : ''}
        </h2>
        {reviews.length === 0 ? (
          <p className={css.detail}>No reviews yet - this provider hasn't completed a confirmed job here.</p>
        ) : (
          <ul className={css.reviewList}>
            {reviews.map(review => (
              <li key={review._id} className={css.reviewRow}>
                <p className={css.reviewRating}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
                {review.comment && <p className={css.reviewComment}>{review.comment}</p>}
                <p className={css.reviewAuthor}>
                  {review.author?.firstName || 'A customer'} · {new Date(review.createdAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default ProviderPublicProfilePageV2;
