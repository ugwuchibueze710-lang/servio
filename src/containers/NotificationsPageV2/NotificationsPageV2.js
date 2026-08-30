/**
 * src/containers/NotificationsPageV2/NotificationsPageV2.js
 *
 * Real, persisted notification list (spec section 40) - GET /api/v2/notifications rendered as-is,
 * with mark-read/mark-all-read actions that call the real backend. Any notification tied to a
 * booking links straight to that job's Project Passport, since a Passport is the single place a
 * customer or provider goes to act on it (spec section 51). Nothing here is simulated: the list,
 * the unread count, and every read state come from the server.
 */
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

import { hasAppUserToken } from '../../util/apiV2';
import {
  fetchNotificationsV2Thunk,
  markReadV2Thunk,
  markAllReadV2Thunk,
} from './NotificationsPageV2.duck';

import css from './NotificationsPageV2.module.css';

const TYPE_LABELS = {
  new_request: 'New request',
  request_accepted: 'Request accepted',
  request_declined: 'Request declined',
  new_message: 'New message',
  quote_received: 'Quote received',
  quote_accepted: 'Quote accepted',
  quote_declined: 'Quote declined',
  job_scheduled: 'Job scheduled',
  job_completed: 'Job completed',
  confirmation_needed: 'Confirmation needed',
  payment_received: 'Payment received',
  payout_released: 'Payout released',
  review_received: 'Review received',
  review_request: 'Review request',
  dispute_opened: 'Dispute opened',
  dispute_resolved: 'Dispute resolved',
  cancellation: 'Cancellation',
};

const formatWhen = iso => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return '';
  }
};

const NotificationsPageV2 = () => {
  const dispatch = useDispatch();
  const page = useSelector(state => state.NotificationsPageV2);

  useEffect(() => {
    if (!hasAppUserToken()) {
      window.location.href = `/auth-v2?returnTo=${encodeURIComponent('/notifications-v2')}`;
      return;
    }
    dispatch(fetchNotificationsV2Thunk());
  }, [dispatch]);

  const notifications = page.notifications || [];

  return (
    <div className={css.root}>
      <div className={css.header}>
        <h1 className={css.title}>Notifications</h1>
        {page.unreadCount > 0 ? (
          <button
            type="button"
            className={css.markAllButton}
            onClick={() => dispatch(markAllReadV2Thunk())}
          >
            Mark all as read
          </button>
        ) : null}
      </div>

      {page.fetchInProgress ? <p className={css.statusText}>Loading…</p> : null}
      {page.fetchError ? (
        <p className={css.errorText}>
          Could not load notifications right now. Please try again shortly.
        </p>
      ) : null}

      {!page.fetchInProgress && notifications.length === 0 && !page.fetchError ? (
        <p className={css.emptyText}>You have no notifications yet.</p>
      ) : null}

      <ul className={css.list}>
        {notifications.map(n => {
          const content = (
            <>
              <div className={css.itemHeader}>
                <span className={css.itemType}>{TYPE_LABELS[n.type] || n.type}</span>
                <span className={css.itemWhen}>{formatWhen(n.createdAt)}</span>
              </div>
              <div className={css.itemTitle}>{n.title}</div>
              {n.body ? <div className={css.itemBody}>{n.body}</div> : null}
            </>
          );

          const itemClassName = n.read ? css.item : css.itemUnread;

          return (
            <li key={n._id} className={itemClassName}>
              {n.booking ? (
                <Link
                  to={`/booking-v2/${n.booking}`}
                  className={css.itemLink}
                  onClick={() => {
                    if (!n.read) dispatch(markReadV2Thunk(n._id));
                  }}
                >
                  {content}
                </Link>
              ) : (
                <div className={css.itemLink}>{content}</div>
              )}
              {!n.read ? (
                <button
                  type="button"
                  className={css.markReadButton}
                  onClick={() => dispatch(markReadV2Thunk(n._id))}
                >
                  Mark as read
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default NotificationsPageV2;
