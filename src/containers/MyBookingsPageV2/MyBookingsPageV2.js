/**
 * src/containers/MyBookingsPageV2/MyBookingsPageV2.js
 *
 * The real customer dashboard (spec section 21): active + past requests, and saved/favorite
 * providers with a real "book again" action. Every request row links into the real Project
 * Passport page (/booking-v2/:id) for all actions - payment, cancellation, messaging, confirm/
 * dispute, review - so there is exactly one place that drives a booking forward.
 */
import React, { useEffect, useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { fetchMyBookingsV2Thunk, fetchSavedProvidersV2Thunk, unsaveProviderV2Thunk } from './MyBookingsPageV2.duck';
import { hasAppUserToken } from '../../util/apiV2';

import css from './MyBookingsPageV2.module.css';

const STATUS_LABELS = {
  requested: 'Waiting for provider response',
  accepted: 'Accepted - awaiting payment',
  declined: 'Declined',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_pending_confirmation: 'Awaiting your confirmation',
  confirmed: 'Confirmed',
  paid_out: 'Completed',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const ACTIVE_STATUSES = ['requested', 'accepted', 'scheduled', 'in_progress', 'completed_pending_confirmation', 'disputed'];

const MyBookingsPageV2 = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const page = useSelector(state => state.MyBookingsPageV2);
  const params = new URLSearchParams(location.search);
  const [tab, setTab] = useState(params.get('tab') === 'saved' ? 'saved' : 'requests');

  // Sharetribe's auth:true route gate (state.auth.isAuthenticated) is gone from this route -
  // see routeConfiguration.js's comment on this route entry - since that state can never become
  // true anymore. Redirect on mount if there's no real v2 session, mirroring the pattern already
  // used by BookingRequestPageV2.js.
  useEffect(() => {
    if (!hasAppUserToken()) {
      history.push(`/auth-v2?returnTo=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [history]);

  useEffect(() => {
    dispatch(fetchMyBookingsV2Thunk());
    dispatch(fetchSavedProvidersV2Thunk());
  }, [dispatch]);

  const active = page.data.filter(b => ACTIVE_STATUSES.includes(b.status));
  const past = page.data.filter(b => !ACTIVE_STATUSES.includes(b.status));

  return (
    <div className={css.root}>
      <h1 className={css.title}>My requests</h1>

      <div className={css.tabs}>
        <button type="button" className={tab === 'requests' ? css.tabActive : css.tab} onClick={() => setTab('requests')}>
          Requests
        </button>
        <button type="button" className={tab === 'saved' ? css.tabActive : css.tab} onClick={() => setTab('saved')}>
          Saved providers
        </button>
      </div>

      {tab === 'requests' && (
        <>
          {page.fetchError && <p className={css.errorText}>Something went wrong loading your requests.</p>}
          {!page.fetchInProgress && page.data.length === 0 && <p>You haven&apos;t requested any services yet.</p>}

          {active.length > 0 && (
            <>
              <h2 className={css.sectionTitle}>Active</h2>
              <ul className={css.list}>
                {active.map(booking => (
                  <li key={booking._id} className={css.card}>
                    <Link to={`/booking-v2/${booking._id}`} className={css.cardLink}>
                      <p className={css.businessName}>{booking.business?.name}</p>
                      <p className={css.category}>{booking.category?.name}</p>
                      <p className={css.description}>{booking.description}</p>
                      <p className={css.status}>{STATUS_LABELS[booking.status] || booking.status}</p>
                      {typeof booking.quotedPrice === 'number' && (
                        <p className={css.price}>Quoted: ${booking.quotedPrice.toFixed(2)}</p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {past.length > 0 && (
            <>
              <h2 className={css.sectionTitle}>Past</h2>
              <ul className={css.list}>
                {past.map(booking => (
                  <li key={booking._id} className={css.card}>
                    <Link to={`/booking-v2/${booking._id}`} className={css.cardLink}>
                      <p className={css.businessName}>{booking.business?.name}</p>
                      <p className={css.category}>{booking.category?.name}</p>
                      <p className={css.status}>{STATUS_LABELS[booking.status] || booking.status}</p>
                    </Link>
                    {booking.business && (
                      <Link to={`/book-v2/${booking.business._id}`} className={css.bookAgainLink}>
                        Book again
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {tab === 'saved' && (
        <>
          {page.fetchSavedError && <p className={css.errorText}>Something went wrong loading your saved providers.</p>}
          {!page.fetchSavedInProgress && page.savedProviders.length === 0 && (
            <p>You haven&apos;t saved any providers yet - look for the ♡ button on a provider&apos;s profile.</p>
          )}
          <ul className={css.list}>
            {page.savedProviders.map(business => (
              <li key={business._id} className={css.card}>
                <Link to={`/provider-v2/${business._id}`} className={css.cardLink}>
                  <p className={css.businessName}>{business.name}</p>
                  {business.ratingCount > 0 && (
                    <p className={css.category}>{business.ratingAvg.toFixed(1)} ★ ({business.ratingCount})</p>
                  )}
                  <p className={css.description}>{business.bio}</p>
                </Link>
                <div className={css.savedActions}>
                  <Link to={`/book-v2/${business._id}`} className={css.bookAgainLink}>
                    Request
                  </Link>
                  <button type="button" className={css.unsaveButton} onClick={() => dispatch(unsaveProviderV2Thunk(business._id))}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};

export default MyBookingsPageV2;
