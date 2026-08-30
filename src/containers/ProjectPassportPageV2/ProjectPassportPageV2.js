/**
 * src/containers/ProjectPassportPageV2/ProjectPassportPageV2.js
 *
 * The real "Project Passport" (spec section 51, differentiator #2): everything about one job in
 * one place - the original request, the provider's quote, the in-app message thread (never a
 * standalone chat - spec section 55), every status change, payment, completion evidence, dispute,
 * and the review - for BOTH the customer and the provider, from the same URL. Every action here
 * calls a real backend endpoint and re-renders from what the server actually returns; nothing is
 * simulated client-side, and every irreversible action (pay, confirm, dispute, cancel) requires
 * an explicit click, never an automatic AI-driven trigger (spec section 60).
 */
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

import BookingPaymentForm from '../../components/BookingPaymentForm/BookingPaymentForm';
import PhotoUploader from '../../components/PhotoUploader/PhotoUploader';
import { hasAppUserToken } from '../../util/apiV2';
import {
  fetchBookingV2Thunk,
  fetchMessagesV2Thunk,
  sendMessageV2Thunk,
  respondV2Thunk,
  updateStatusV2Thunk,
  confirmBookingV2Thunk,
  disputeV2Thunk,
  disputeRespondV2Thunk,
  createPaymentIntentV2Thunk,
  submitReviewV2Thunk,
  clearActionError,
} from './ProjectPassportPageV2.duck';

import css from './ProjectPassportPageV2.module.css';

const STATUS_LABELS = {
  requested: 'Requested',
  accepted: 'Accepted - awaiting payment',
  declined: 'Declined',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed_pending_confirmation: 'Marked complete - awaiting your confirmation',
  confirmed: 'Confirmed',
  paid_out: 'Completed & paid',
  disputed: 'Disputed',
  cancelled: 'Cancelled',
};

const PAYABLE_STATUSES = ['accepted', 'scheduled', 'in_progress', 'completed_pending_confirmation'];
const CANCELLABLE_STATUSES = ['requested', 'accepted', 'scheduled', 'in_progress'];

const ProjectPassportPageV2 = props => {
  const { bookingId } = props.params || {};
  const dispatch = useDispatch();
  const page = useSelector(state => state.ProjectPassportPageV2);

  const [messageText, setMessageText] = useState('');
  const [quotedPriceInput, setQuotedPriceInput] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [completionPhotos, setCompletionPhotos] = useState([]);
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeResponse, setDisputeResponse] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  useEffect(() => {
    if (!hasAppUserToken()) {
      window.location.href = `/auth-v2?returnTo=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    if (bookingId) {
      dispatch(fetchBookingV2Thunk(bookingId));
      dispatch(fetchMessagesV2Thunk(bookingId));
    }
  }, [dispatch, bookingId]);

  if (page.fetchInProgress && !page.booking) {
    return <div className={css.root}><p>Loading…</p></div>;
  }
  if (page.fetchError || !page.booking) {
    return <div className={css.root}><p className={css.errorText}>This request could not be found.</p></div>;
  }

  const { booking, viewerRole } = page;
  const isProvider = viewerRole === 'provider';
  const isCustomer = viewerRole === 'customer';

  const handleSendMessage = e => {
    e.preventDefault();
    if (!messageText.trim()) return;
    dispatch(sendMessageV2Thunk({ bookingId, text: messageText.trim() })).then(result => {
      if (result.meta.requestStatus === 'fulfilled') setMessageText('');
    });
  };

  const handleAccept = () => {
    const price = Number(quotedPriceInput);
    if (!Number.isFinite(price) || price <= 0) return;
    dispatch(respondV2Thunk({ bookingId, action: 'accept', quotedPrice: price }));
  };
  const handleDecline = () => dispatch(respondV2Thunk({ bookingId, action: 'decline' }));

  const handleStatus = status => dispatch(updateStatusV2Thunk({ bookingId, status }));

  const handleMarkComplete = () => {
    dispatch(
      updateStatusV2Thunk({
        bookingId,
        status: 'completed_pending_confirmation',
        completionEvidencePhotos: completionPhotos.map(p => ({ url: p.url })),
      })
    ).then(result => {
      if (result.meta.requestStatus === 'fulfilled') setShowCompleteForm(false);
    });
  };

  const handleCancel = () => {
    if (!cancelReason.trim()) return;
    dispatch(updateStatusV2Thunk({ bookingId, status: 'cancelled', cancelReason: cancelReason.trim() })).then(
      result => {
        if (result.meta.requestStatus === 'fulfilled') setShowCancelForm(false);
      }
    );
  };

  const handlePayNow = () => {
    dispatch(createPaymentIntentV2Thunk(bookingId)).then(result => {
      if (result.meta.requestStatus === 'fulfilled') setShowPayment(true);
    });
  };

  const handleConfirm = () => dispatch(confirmBookingV2Thunk(bookingId));
  const handleDispute = () => {
    if (disputeReason.trim().length < 10) return;
    dispatch(disputeV2Thunk({ bookingId, reason: disputeReason.trim() }));
  };
  const handleDisputeRespond = () => {
    if (disputeResponse.trim().length < 5) return;
    dispatch(disputeRespondV2Thunk({ bookingId, response: disputeResponse.trim() }));
  };
  const handleSubmitReview = () => {
    dispatch(submitReviewV2Thunk({ bookingId, rating: reviewRating, comment: reviewComment.trim() || undefined }));
  };

  const canPay = isCustomer && PAYABLE_STATUSES.includes(booking.status) && booking.paymentStatus === 'unpaid' && booking.quotedPrice > 0;
  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);
  const canReview = isCustomer && ['confirmed', 'paid_out'].includes(booking.status) && !page.reviewSubmitted;

  return (
    <div className={css.root}>
      <Link to={isProvider ? '/provider-inbox-v2' : '/my-bookings-v2'} className={css.backLink}>
        ← Back
      </Link>

      <div className={css.header}>
        <div>
          <h1 className={css.title}>{booking.category?.name || 'Service request'}</h1>
          <p className={css.subtitle}>
            {isProvider ? 'Customer' : 'Provider'}: {isProvider ? booking.customer?.firstName : booking.business?.name}
          </p>
        </div>
        <span className={css.statusBadge}>{STATUS_LABELS[booking.status] || booking.status}</span>
      </div>

      {page.actionError && (
        <p className={css.errorText}>
          {page.actionError.message || 'Something went wrong. Please try again.'}
          <button type="button" className={css.dismissError} onClick={() => dispatch(clearActionError())}>
            ×
          </button>
        </p>
      )}

      <section className={css.section}>
        <h2 className={css.sectionTitle}>Request details</h2>
        <p className={css.description}>{booking.description}</p>
        {booking.locationLabel && <p className={css.detail}>Location: {booking.locationLabel}</p>}
        {booking.requestedDate && (
          <p className={css.detail}>Preferred date: {new Date(booking.requestedDate).toLocaleDateString()}</p>
        )}
        {booking.requestedTimeNote && <p className={css.detail}>Preferred time: {booking.requestedTimeNote}</p>}
        {booking.budgetNote && <p className={css.detail}>Budget: {booking.budgetNote}</p>}
        {booking.additionalNotes && <p className={css.detail}>Notes: {booking.additionalNotes}</p>}
        {booking.photos?.length > 0 && (
          <div className={css.photoGrid}>
            {booking.photos.map((p, i) => (
              <img key={i} src={p.url} alt="Request" className={css.photoThumb} />
            ))}
          </div>
        )}
      </section>

      {booking.status === 'requested' && isProvider && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Respond to this request</h2>
          <div className={css.inlineForm}>
            <input
              className={css.input}
              type="number"
              min="1"
              placeholder="Quote a price ($)"
              value={quotedPriceInput}
              onChange={e => setQuotedPriceInput(e.target.value)}
            />
            <button type="button" className={css.primaryButton} onClick={handleAccept} disabled={page.actionInProgress}>
              Accept & quote
            </button>
            <button type="button" className={css.secondaryButton} onClick={handleDecline} disabled={page.actionInProgress}>
              Decline
            </button>
          </div>
        </section>
      )}

      {booking.quotedPrice > 0 && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Quote</h2>
          <p className={css.priceText}>${booking.quotedPrice}</p>
          <p className={css.detail}>Payment status: {booking.paymentStatus}</p>
        </section>
      )}

      {isProvider && booking.status === 'accepted' && (
        <button type="button" className={css.primaryButton} onClick={() => handleStatus('scheduled')} disabled={page.actionInProgress}>
          Mark as scheduled
        </button>
      )}
      {isProvider && booking.status === 'scheduled' && (
        <button type="button" className={css.primaryButton} onClick={() => handleStatus('in_progress')} disabled={page.actionInProgress}>
          Start job
        </button>
      )}
      {isProvider && booking.status === 'in_progress' && !showCompleteForm && (
        <button type="button" className={css.primaryButton} onClick={() => setShowCompleteForm(true)}>
          Mark complete
        </button>
      )}
      {isProvider && showCompleteForm && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Completion evidence (optional but recommended)</h2>
          <PhotoUploader purpose="completion_evidence" bookingId={bookingId} value={completionPhotos} onChange={setCompletionPhotos} />
          <button type="button" className={css.primaryButton} onClick={handleMarkComplete} disabled={page.actionInProgress}>
            Confirm job complete
          </button>
        </section>
      )}

      {canPay && !showPayment && (
        <button type="button" className={css.primaryButton} onClick={handlePayNow} disabled={page.paymentIntentInProgress}>
          {page.paymentIntentInProgress ? 'Preparing payment…' : `Pay $${booking.quotedPrice} now`}
        </button>
      )}
      {canPay && showPayment && page.paymentClientSecret && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Payment</h2>
          <BookingPaymentForm
            clientSecret={page.paymentClientSecret}
            onSuccess={() => {
              setShowPayment(false);
              dispatch(fetchBookingV2Thunk(bookingId));
            }}
          />
        </section>
      )}

      {isCustomer && booking.status === 'completed_pending_confirmation' && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Was this job done to your satisfaction?</h2>
          {booking.completionEvidencePhotos?.length > 0 && (
            <div className={css.photoGrid}>
              {booking.completionEvidencePhotos.map((p, i) => (
                <img key={i} src={p.url} alt="Completion evidence" className={css.photoThumb} />
              ))}
            </div>
          )}
          {booking.confirmationDeadline && (
            <p className={css.detail}>
              Please respond by {new Date(booking.confirmationDeadline).toLocaleString()}.
            </p>
          )}
          <div className={css.inlineForm}>
            <button type="button" className={css.primaryButton} onClick={handleConfirm} disabled={page.actionInProgress}>
              Confirm - job well done
            </button>
          </div>
          <textarea
            className={css.textarea}
            placeholder="Describe the problem (to report an issue instead)"
            value={disputeReason}
            onChange={e => setDisputeReason(e.target.value)}
          />
          <button type="button" className={css.secondaryButton} onClick={handleDispute} disabled={page.actionInProgress}>
            Report a problem
          </button>
        </section>
      )}

      {booking.status === 'disputed' && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Dispute</h2>
          <p className={css.detail}>Reason: {booking.dispute?.reason}</p>
          {booking.dispute?.providerResponse ? (
            <p className={css.detail}>Provider response: {booking.dispute.providerResponse}</p>
          ) : isProvider ? (
            <div className={css.inlineForm}>
              <textarea
                className={css.textarea}
                placeholder="Respond to this dispute"
                value={disputeResponse}
                onChange={e => setDisputeResponse(e.target.value)}
              />
              <button type="button" className={css.primaryButton} onClick={handleDisputeRespond} disabled={page.actionInProgress}>
                Send response
              </button>
            </div>
          ) : (
            <p className={css.detail}>Waiting for the provider to respond. Our team will review this shortly.</p>
          )}
        </section>
      )}

      {canReview && (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>Leave a review</h2>
          <select className={css.input} value={reviewRating} onChange={e => setReviewRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map(n => (
              <option key={n} value={n}>{'★'.repeat(n)}</option>
            ))}
          </select>
          <textarea
            className={css.textarea}
            placeholder="How did it go? (optional)"
            value={reviewComment}
            onChange={e => setReviewComment(e.target.value)}
          />
          <button type="button" className={css.primaryButton} onClick={handleSubmitReview}>
            Submit review
          </button>
        </section>
      )}
      {page.reviewSubmitted && <p className={css.successText}>Thanks for your review!</p>}

      {canCancel && !showCancelForm && (
        <button type="button" className={css.dangerButton} onClick={() => setShowCancelForm(true)}>
          Cancel this request
        </button>
      )}
      {showCancelForm && (
        <section className={css.section}>
          <textarea
            className={css.textarea}
            placeholder="Why are you cancelling?"
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
          />
          <div className={css.inlineForm}>
            <button type="button" className={css.dangerButton} onClick={handleCancel} disabled={page.actionInProgress}>
              Confirm cancellation
            </button>
            <button type="button" className={css.secondaryButton} onClick={() => setShowCancelForm(false)}>
              Never mind
            </button>
          </div>
          {booking.cancellationFee?.amount > 0 && (
            <p className={css.detail}>
              A ${booking.cancellationFee.amount} cancellation fee may apply ({booking.cancellationFee.reason}).
            </p>
          )}
        </section>
      )}

      <section className={css.section}>
        <h2 className={css.sectionTitle}>Messages</h2>
        <div className={css.messageList}>
          {page.messages.length === 0 && <p className={css.detail}>No messages yet.</p>}
          {page.messages.map(m => (
            <div key={m._id} className={css.messageRow}>
              <p className={css.messageText}>{m.text}</p>
              <p className={css.messageMeta}>{new Date(m.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
        <form className={css.inlineForm} onSubmit={handleSendMessage}>
          <input
            className={css.input}
            type="text"
            placeholder="Send a message about this job"
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
          />
          <button type="submit" className={css.primaryButton} disabled={page.sendMessageInProgress}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
};

export default ProjectPassportPageV2;
