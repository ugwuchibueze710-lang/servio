/**
 * src/components/BookingPaymentForm/BookingPaymentForm.js
 *
 * A real, minimal Stripe Elements card form for paying a booking's quoted price. Deliberately
 * NOT reusing src/containers/CheckoutPage/StripePaymentForm/StripePaymentForm.js: that component
 * is tightly coupled to Sharetribe's own transaction-process/transition machinery (it hands its
 * onSubmit a `{card, formId, formValues, paymentMethod}` shape meant for a Sharetribe
 * transition, not a raw Stripe PaymentIntent client secret) - using it here would mean either
 * silently mismatched params or a deep rewrite of a widely-shared component. Instead, this talks
 * to Stripe.js directly (the same window.Stripe v3 script the whole app already loads - see
 * src/util/includeScripts.js), which is the real, documented, minimal way to confirm a card
 * payment against a PaymentIntent client secret: https://stripe.com/docs/js/payment_intents.
 *
 * @param {string} props.clientSecret - from POST /api/v2/payments/bookings/:id/intent
 * @param {() => void} props.onSuccess
 */
import React, { useEffect, useRef, useState } from 'react';
import { publishableKey } from '../../config/configStripe';
import { STRIPE_JS_LOADED_EVENT } from '../../util/includeScripts';
import css from './BookingPaymentForm.module.css';

const BookingPaymentForm = ({ clientSecret, onSuccess }) => {
  const cardElementRef = useRef(null);
  const stripeRef = useRef(null);
  const elementsRef = useRef(null);
  const cardRef = useRef(null);
  const [stripeReady, setStripeReady] = useState(typeof window !== 'undefined' && !!window.Stripe);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (stripeReady) return undefined;
    const onLoaded = () => setStripeReady(!!window.Stripe);
    window.addEventListener(STRIPE_JS_LOADED_EVENT, onLoaded);
    return () => window.removeEventListener(STRIPE_JS_LOADED_EVENT, onLoaded);
  }, [stripeReady]);

  useEffect(() => {
    if (!stripeReady || !publishableKey || !cardElementRef.current) return undefined;
    const stripe = window.Stripe(publishableKey);
    const elements = stripe.elements();
    const card = elements.create('card');
    card.mount(cardElementRef.current);
    card.on('change', event => setError(event.error ? event.error.message : null));

    stripeRef.current = stripe;
    elementsRef.current = elements;
    cardRef.current = card;

    return () => card.destroy();
  }, [stripeReady]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!stripeRef.current || !cardRef.current || submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await stripeRef.current.confirmCardPayment(clientSecret, {
      payment_method: { card: cardRef.current },
    });

    setSubmitting(false);
    if (result.error) {
      setError(result.error.message || 'Your card could not be charged. Please try again.');
      return;
    }
    if (result.paymentIntent?.status === 'succeeded' || result.paymentIntent?.status === 'processing') {
      onSuccess();
    }
  };

  if (!publishableKey) {
    return <p className={css.errorText}>Payments are not configured yet.</p>;
  }
  if (!stripeReady) {
    return <p>Loading payment form…</p>;
  }

  return (
    <form className={css.form} onSubmit={handleSubmit}>
      <div className={css.cardElement} ref={cardElementRef} />
      {error && <p className={css.errorText}>{error}</p>}
      <button type="submit" className={css.payButton} disabled={submitting}>
        {submitting ? 'Processing…' : 'Pay now'}
      </button>
    </form>
  );
};

export default BookingPaymentForm;
