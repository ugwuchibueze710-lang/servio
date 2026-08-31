/**
 * src/containers/ProviderInboxPageV2/ProviderInboxPageV2.js
 *
 * The real provider dashboard (spec sections 26-28): metrics computed from actual data (never
 * hardcoded) - profile views, response rate/time, completed jobs, cancellation rate, and real
 * lifetime earnings summed from this provider's own paid_out bookings - plus the real
 * "Accepting New Jobs" gate and the request/job list. Every row links into the real Project
 * Passport page for all actions (accept/quote/schedule/complete/cancel/messages) - this page
 * itself is read-only + the one toggle, on purpose, so there is exactly one place that drives a
 * booking's status forward.
 */
import React, { useEffect } from 'react';
import { Link, useHistory } from 'react-router-dom';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import { useDispatch, useSelector } from 'react-redux';

import { fetchMyBusinessV2Thunk, fetchInboxV2Thunk, setAcceptingJobsV2Thunk } from './ProviderInboxPageV2.duck';
import { hasAppUserToken } from '../../util/apiV2';

import css from './ProviderInboxPageV2.module.css';

const STATUS_LABELS = {
  requested: 'New request',
  accepted: 'Accepted - awaiting payment',
  declined: 'Declined',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_pending_confirmation: 'Awaiting customer confirmation',
  confirmed: 'Confirmed',
  paid_out: 'Paid out',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const formatHours = ms => {
  if (!ms) return '—';
  const hours = ms / (1000 * 60 * 60);
  return hours < 1 ? `${Math.round(ms / 60000)} min` : `${hours.toFixed(1)} hrs`;
};

const ProviderInboxPageV2 = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const page = useSelector(state => state.ProviderInboxPageV2);

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
    dispatch(fetchMyBusinessV2Thunk());
    dispatch(fetchInboxV2Thunk());
  }, [dispatch]);

  if (page.fetchBusinessInProgress && !page.business) {
    return (
      <>
        <TopbarContainer currentPage="ProviderInboxPageV2" />
        <div className={css.root}><p>Loading your dashboard...</p></div>
      </>
    );
  }

  if (!page.business) {
    return (
      <>
        <TopbarContainer currentPage="ProviderInboxPageV2" />
        <div className={css.root}>
          <p>You don&apos;t have a provider profile yet.</p>
          <a className={css.link} href="/provider-profile-v2">
            Set up your provider profile
          </a>
        </div>
      </>
    );
  }

  const { business, data } = page;
  const responseRate = business.requestsReceivedCount > 0
    ? Math.round((business.requestsRespondedCount / business.requestsReceivedCount) * 100)
    : null;
  const avgResponseTime = business.requestsRespondedCount > 0
    ? formatHours(business.totalResponseTimeMs / business.requestsRespondedCount)
    : '—';
  const totalJobs = business.completedJobsCount + business.cancelledJobsCount;
  const cancellationRate = totalJobs > 0 ? Math.round((business.cancelledJobsCount / totalJobs) * 100) : null;
  const lifetimeEarnings = data
    .filter(b => b.status === 'paid_out' && typeof b.providerPayoutAmount === 'number')
    .reduce((sum, b) => sum + b.providerPayoutAmount, 0);

  const activeRequests = data.filter(b => !['declined', 'cancelled', 'paid_out'].includes(b.status));
  const pastRequests = data.filter(b => ['declined', 'cancelled', 'paid_out'].includes(b.status));

  return (
    <>
      <TopbarContainer currentPage="ProviderInboxPageV2" />
      <div className={css.root}>
      <div className={css.headerRow}>
        <h1 className={css.title}>{business.name}</h1>
        <label className={css.toggle}>
          <input
            type="checkbox"
            checked={business.acceptingNewJobs}
            disabled={page.toggleInProgress}
            onChange={e => dispatch(setAcceptingJobsV2Thunk(e.target.checked))}
          />
          Accepting new jobs
        </label>
      </div>
      {page.toggleError && <p className={css.errorText}>Could not update this setting. Please try again.</p>}

      <div className={css.metricsGrid}>
        <div className={css.metricCard}>
          <p className={css.metricValue}>{business.profileViewCount}</p>
          <p className={css.metricLabel}>Profile views</p>
        </div>
        <div className={css.metricCard}>
          <p className={css.metricValue}>{responseRate !== null ? `${responseRate}%` : '—'}</p>
          <p className={css.metricLabel}>Response rate</p>
        </div>
        <div className={css.metricCard}>
          <p className={css.metricValue}>{avgResponseTime}</p>
          <p className={css.metricLabel}>Avg. response time</p>
        </div>
        <div className={css.metricCard}>
          <p className={css.metricValue}>{business.completedJobsCount}</p>
          <p className={css.metricLabel}>Completed jobs</p>
        </div>
        <div className={css.metricCard}>
          <p className={css.metricValue}>{cancellationRate !== null ? `${cancellationRate}%` : '—'}</p>
          <p className={css.metricLabel}>Cancellation rate</p>
        </div>
        <div className={css.metricCard}>
          <p className={css.metricValue}>{business.ratingCount > 0 ? business.ratingAvg.toFixed(1) : '—'}</p>
          <p className={css.metricLabel}>Rating ({business.ratingCount})</p>
        </div>
        <div className={css.metricCard}>
          <p className={css.metricValue}>${lifetimeEarnings.toFixed(2)}</p>
          <p className={css.metricLabel}>Lifetime earnings</p>
        </div>
      </div>

      {!business.stripeConnectPayoutsEnabled && (
        <p className={css.warningBanner}>
          Set up Stripe Connect in your provider settings to receive payouts.{' '}
          <a href="/provider-profile-v2">Set up now</a>
        </p>
      )}

      {page.fetchError && <p className={css.errorText}>Something went wrong loading your requests.</p>}
      {page.noProviderProfileMessage && <p>{page.noProviderProfileMessage}</p>}

      <h2 className={css.sectionTitle}>Active requests & jobs</h2>
      {activeRequests.length === 0 && <p className={css.detail}>Nothing active right now.</p>}
      <ul className={css.list}>
        {activeRequests.map(booking => (
          <li key={booking._id} className={css.card}>
            <Link to={`/booking-v2/${booking._id}`} className={css.cardLink}>
              <p className={css.customerName}>
                {booking.customer?.firstName} {booking.customer?.lastName}
              </p>
              <p className={css.category}>{booking.category?.name}</p>
              <p className={css.description}>{booking.description}</p>
              <p className={css.status}>{STATUS_LABELS[booking.status] || booking.status}</p>
            </Link>
          </li>
        ))}
      </ul>

      {pastRequests.length > 0 && (
        <>
          <h2 className={css.sectionTitle}>Past</h2>
          <ul className={css.list}>
            {pastRequests.map(booking => (
              <li key={booking._id} className={css.card}>
                <Link to={`/booking-v2/${booking._id}`} className={css.cardLink}>
                  <p className={css.customerName}>
                    {booking.customer?.firstName} {booking.customer?.lastName}
                  </p>
                  <p className={css.category}>{booking.category?.name}</p>
                  <p className={css.status}>{STATUS_LABELS[booking.status] || booking.status}</p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
    </>
  );
};

export default ProviderInboxPageV2;
