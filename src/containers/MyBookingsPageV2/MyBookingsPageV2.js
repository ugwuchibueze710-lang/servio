/**
 * src/containers/MyBookingsPageV2/MyBookingsPageV2.js
 *
 * A customer's real booking list and status tracking - see .duck.js header for the payment
 * flow's one disclosed gap (no single-booking poll after paying).
 */
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import StripePaymentForm from '../CheckoutPage/StripePaymentForm/StripePaymentForm';
import { CANCELLABLE_STATUSES, PAYABLE_STATUSES } from '../../booking/bookingProcessV2';
import {
  fetchMyBookingsV2Thunk,
  createBookingPaymentIntentV2Thunk,
  confirmBookingPaymentV2Thunk,
  cancelBookingV2Thunk,
  openPaymentFormV2,
  closePaymentFormV2,
} from './MyBookingsPageV2.duck';

import css from './MyBookingsPageV2.module.css';

const STATUS_LABELS = {
  requested: 'Waiting for provider response',
  accepted: 'Accepted',
  declined: 'Declined',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const MyBookingsPageV2 = () => {
  const dispatch = useDispatch();
  const page = useSelector(state => state.MyBookingsPageV2);

  useEffect(() => {
    dispatch(fetchMyBookingsV2Thunk());
  }, [dispatch]);

  const handlePayNow = bookingId => {
    dispatch(openPaymentFormV2(bookingId));
    dispatch(createBookingPaymentIntentV2Thunk(bookingId));
  };

  const handleCancel = bookingId => {
    dispatch(cancelBookingV2Thunk(bookingId));
  };

  if (page.fetchInProgress && page.data.length === 0) {
    return (
      <div className={css.root}>
        <p>Loading your bookings...</p>
      </div>
    );
  }

  return (
    <div className={css.root}>
      <h1 className={css.title}>My bookings</h1>

      {page.fetchError && <p className={css.errorText}>Something went wrong loading your bookings.</p>}

      {!page.fetchInProgress && page.data.length === 0 && (
        <p>You haven&apos;t requested any services yet.</p>
      )}

      <ul className={css.list}>
        {page.data.map(booking => {
          const canPay =
            PAYABLE_STATUSES.includes(booking.status) &&
            booking.paymentStatus !== 'paid' &&
            booking.quotedPrice > 0;
          const canCancel = CANCELLABLE_STATUSES.includes(booking.status);
          const showPaymentForm = page.activeBookingId === booking._id && page.paymentClientSecret;

          return (
            <li key={booking._id} className={css.card}>
              <p className={css.businessName}>{booking.business?.name}</p>
              <p className={css.category}>{booking.category?.name}</p>
              <p className={css.description}>{booking.description}</p>
              <p className={css.status}>{STATUS_LABELS[booking.status] || booking.status}</p>
              {typeof booking.quotedPrice === 'number' && (
                <p className={css.price}>
                  Quoted: ${booking.quotedPrice.toFixed(2)}
                  {booking.paymentStatus === 'paid' && ' - Paid'}
                  {booking.paymentStatus === 'processing' && ' - Payment processing'}
                </p>
              )}

              {canPay && page.activeBookingId !== booking._id && (
                <button className={css.primaryButton} onClick={() => handlePayNow(booking._id)}>
                  Pay ${booking.quotedPrice.toFixed(2)}
                </button>
              )}

              {page.activeBookingId === booking._id && page.createIntentInProgress && (
                <p>Preparing payment...</p>
              )}
              {page.activeBookingId === booking._id && page.createIntentError && (
                <p className={css.errorText}>Something went wrong starting payment. Please try again.</p>
              )}

              {showPaymentForm && (
                <div className={css.paymentBox}>
                  <StripePaymentForm
                    formId={`MyBookingsV2PaymentForm-${booking._id}`}
                    inProgress={page.confirmInProgress}
                    confirmCardPaymentError={page.confirmError}
                    onSubmit={values => {
                      const { stripe, paymentParams, stripePaymentIntentClientSecret } = values;
                      dispatch(
                        confirmBookingPaymentV2Thunk({
                          bookingId: booking._id,
                          stripe,
                          paymentParams,
                          stripePaymentIntentClientSecret,
                        })
                      );
                    }}
                  />
                  <button className={css.secondaryButton} onClick={() => dispatch(closePaymentFormV2())}>
                    Cancel payment
                  </button>
                </div>
              )}

              {canCancel && !showPaymentForm && (
                <button
                  className={css.secondaryButton}
                  onClick={() => handleCancel(booking._id)}
                  disabled={page.cancelInProgress}
                >
                  Cancel request
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default MyBookingsPageV2;
