/**
 * src/containers/MyBookingsPageV2/MyBookingsPageV2.duck.js
 *
 * A customer's own bookings against the new backend - real status tracking plus paying an
 * accepted/quoted booking, using the exact same Stripe integration RidePageV2.duck.js already
 * uses (confirmCardPayment from ducks/stripe.duck.js - Sharetribe-independent, see that file).
 * Unlike Ride, there's no GET-single-booking-by-id endpoint to poll after paying, so this page
 * re-fetches the whole list instead - paymentStatus flips to 'paid' once the Stripe webhook
 * (server/api/v2/payments/webhook.js) actually lands, so an immediate re-fetch may still show
 * 'processing' for a moment; see MIGRATION_PLAN.md for this disclosed gap.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, storableApiV2Error } from '../../util/apiV2';
import { confirmCardPayment } from '../../ducks/stripe.duck';

export const fetchMyBookingsV2Thunk = createAsyncThunk(
  'myBookingsPageV2/fetchMyBookings',
  (_, { rejectWithValue }) => {
    return apiV2('/api/v2/bookings/mine').catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const createBookingPaymentIntentV2Thunk = createAsyncThunk(
  'myBookingsPageV2/createPaymentIntent',
  (bookingId, { rejectWithValue }) => {
    return apiV2(`/api/v2/payments/bookings/${bookingId}/intent`, { method: 'POST' }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

export const confirmBookingPaymentV2Thunk = createAsyncThunk(
  'myBookingsPageV2/confirmPayment',
  ({ bookingId, stripe, paymentParams, stripePaymentIntentClientSecret }, { dispatch, rejectWithValue }) => {
    return dispatch(
      confirmCardPayment({ orderId: bookingId, stripe, paymentParams, stripePaymentIntentClientSecret })
    )
      .then(() => dispatch(fetchMyBookingsV2Thunk()))
      .catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const cancelBookingV2Thunk = createAsyncThunk(
  'myBookingsPageV2/cancelBooking',
  (bookingId, { rejectWithValue }) => {
    return apiV2(`/api/v2/bookings/${bookingId}/status`, {
      method: 'POST',
      body: { status: 'cancelled' },
    }).catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

const initialState = {
  data: [],
  fetchInProgress: false,
  fetchError: null,

  activeBookingId: null, // which booking's payment form is open, if any

  createIntentInProgress: false,
  createIntentError: null,
  paymentClientSecret: null,

  confirmInProgress: false,
  confirmError: null,

  cancelInProgress: false,
  cancelError: null,
};

const myBookingsPageV2Slice = createSlice({
  name: 'myBookingsPageV2',
  initialState,
  reducers: {
    openPaymentFormV2: (state, action) => {
      state.activeBookingId = action.payload;
      state.paymentClientSecret = null;
      state.createIntentError = null;
      state.confirmError = null;
    },
    closePaymentFormV2: state => {
      state.activeBookingId = null;
      state.paymentClientSecret = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchMyBookingsV2Thunk.pending, state => {
        state.fetchInProgress = true;
        state.fetchError = null;
      })
      .addCase(fetchMyBookingsV2Thunk.fulfilled, (state, action) => {
        state.fetchInProgress = false;
        state.data = action.payload.data;
      })
      .addCase(fetchMyBookingsV2Thunk.rejected, (state, action) => {
        state.fetchInProgress = false;
        state.fetchError = action.payload;
      })
      .addCase(createBookingPaymentIntentV2Thunk.pending, state => {
        state.createIntentInProgress = true;
        state.createIntentError = null;
      })
      .addCase(createBookingPaymentIntentV2Thunk.fulfilled, (state, action) => {
        state.createIntentInProgress = false;
        state.paymentClientSecret = action.payload.clientSecret;
      })
      .addCase(createBookingPaymentIntentV2Thunk.rejected, (state, action) => {
        state.createIntentInProgress = false;
        state.createIntentError = action.payload;
      })
      .addCase(confirmBookingPaymentV2Thunk.pending, state => {
        state.confirmInProgress = true;
        state.confirmError = null;
      })
      .addCase(confirmBookingPaymentV2Thunk.fulfilled, state => {
        state.confirmInProgress = false;
        state.activeBookingId = null;
        state.paymentClientSecret = null;
      })
      .addCase(confirmBookingPaymentV2Thunk.rejected, (state, action) => {
        state.confirmInProgress = false;
        state.confirmError = action.payload;
      })
      .addCase(cancelBookingV2Thunk.pending, state => {
        state.cancelInProgress = true;
        state.cancelError = null;
      })
      .addCase(cancelBookingV2Thunk.fulfilled, (state, action) => {
        state.cancelInProgress = false;
        const updated = action.payload.booking;
        state.data = state.data.map(b => (b._id === updated._id ? updated : b));
      })
      .addCase(cancelBookingV2Thunk.rejected, (state, action) => {
        state.cancelInProgress = false;
        state.cancelError = action.payload;
      });
  },
});

export const { openPaymentFormV2, closePaymentFormV2 } = myBookingsPageV2Slice.actions;
export default myBookingsPageV2Slice.reducer;
