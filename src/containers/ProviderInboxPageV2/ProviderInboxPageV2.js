/**
 * src/containers/ProviderInboxPageV2/ProviderInboxPageV2.js
 *
 * A provider's real inbox - accept (with a real quoted price)/decline pending requests, and
 * advance accepted work through scheduled -> in progress -> completed. See .duck.js header.
 */
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  CANCELLABLE_STATUSES,
  PROVIDER_NEXT_STATUS,
  PROVIDER_NEXT_STATUS_LABEL,
} from '../../booking/bookingProcessV2';
import {
  fetchInboxV2Thunk,
  respondBookingV2Thunk,
  advanceBookingStatusV2Thunk,
} from './ProviderInboxPageV2.duck';

import css from './ProviderInboxPageV2.module.css';

const STATUS_LABELS = {
  requested: 'New request',
  accepted: 'Accepted',
  declined: 'Declined',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const ProviderInboxPageV2 = () => {
  const dispatch = useDispatch();
  const page = useSelector(state => state.ProviderInboxPageV2);
  // Real quoted-price input per pending booking, keyed by booking id - not submitted until the
  // provider actually clicks Accept, so a half-typed price never gets sent early.
  const [quotedPrices, setQuotedPrices] = useState({});

  useEffect(() => {
    dispatch(fetchInboxV2Thunk());
  }, [dispatch]);

  const handleAccept = bookingId => {
    const price = Number(quotedPrices[bookingId]);
    dispatch(
      respondBookingV2Thunk({
        bookingId,
        action: 'accept',
        quotedPrice: Number.isFinite(price) && price > 0 ? price : undefined,
      })
    );
  };

  const handleDecline = bookingId => {
    dispatch(respondBookingV2Thunk({ bookingId, action: 'decline' }));
  };

  const handleAdvance = (bookingId, status) => {
    dispatch(advanceBookingStatusV2Thunk({ bookingId, status }));
  };

  const handleCancel = bookingId => {
    dispatch(advanceBookingStatusV2Thunk({ bookingId, status: 'cancelled' }));
  };

  if (page.fetchInProgress && page.data.length === 0) {
    return (
      <div className={css.root}>
        <p>Loading your inbox...</p>
      </div>
    );
  }

  if (page.noProviderProfileMessage) {
    return (
      <div className={css.root}>
        <p>{page.noProviderProfileMessage}</p>
        <a className={css.link} href="/provider-profile-v2">
          Set up your provider profile
        </a>
      </div>
    );
  }

  return (
    <div className={css.root}>
      <h1 className={css.title}>Provider inbox</h1>

      {page.fetchError && <p className={css.errorText}>Something went wrong loading your inbox.</p>}
      {page.actionError && (
        <p className={css.errorText}>
          {page.actionError.message || 'Something went wrong. Please try again.'}
        </p>
      )}

      {!page.fetchInProgress && page.data.length === 0 && <p>No requests yet.</p>}

      <ul className={css.list}>
        {page.data.map(booking => {
          const isActing = page.actionInProgressId === booking._id;
          const nextStatus = PROVIDER_NEXT_STATUS[booking.status];
          const canCancel = CANCELLABLE_STATUSES.includes(booking.status);

          return (
            <li key={booking._id} className={css.card}>
              <p className={css.customerName}>
                {booking.customer?.firstName} {booking.customer?.lastName}
              </p>
              <p className={css.category}>{booking.category?.name}</p>
              <p className={css.description}>{booking.description}</p>
              {booking.locationLabel && <p className={css.detail}>{booking.locationLabel}</p>}
              {booking.requestedDate && (
                <p className={css.detail}>
                  Requested for {new Date(booking.requestedDate).toLocaleDateString()}
                  {booking.requestedTimeNote ? ` - ${booking.requestedTimeNote}` : ''}
                </p>
              )}
              {booking.budgetNote && <p className={css.detail}>Budget: {booking.budgetNote}</p>}
              <p className={css.status}>{STATUS_LABELS[booking.status] || booking.status}</p>
              {typeof booking.quotedPrice === 'number' && (
                <p className={css.detail}>Quoted: ${booking.quotedPrice.toFixed(2)}</p>
              )}

              {booking.status === 'requested' && (
                <div className={css.actionRow}>
                  <input
                    className={css.priceInput}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Quote a price ($)"
                    value={quotedPrices[booking._id] || ''}
                    onChange={e =>
                      setQuotedPrices(prev => ({ ...prev, [booking._id]: e.target.value }))
                    }
                  />
                  <button
                    className={css.primaryButton}
                    onClick={() => handleAccept(booking._id)}
                    disabled={isActing}
                  >
                    Accept
                  </button>
                  <button
                    className={css.secondaryButton}
                    onClick={() => handleDecline(booking._id)}
                    disabled={isActing}
                  >
                    Decline
                  </button>
                </div>
              )}

              {nextStatus && (
                <div className={css.actionRow}>
                  <button
                    className={css.primaryButton}
                    onClick={() => handleAdvance(booking._id, nextStatus)}
                    disabled={isActing}
                  >
                    {PROVIDER_NEXT_STATUS_LABEL[nextStatus]}
                  </button>
                  {canCancel && (
                    <button
                      className={css.secondaryButton}
                      onClick={() => handleCancel(booking._id)}
                      disabled={isActing}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ProviderInboxPageV2;
