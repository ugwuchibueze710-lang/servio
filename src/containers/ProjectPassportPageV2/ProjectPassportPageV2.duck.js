/**
 * src/containers/ProjectPassportPageV2/ProjectPassportPageV2.duck.js
 *
 * The real "Project Passport" (spec section 51, differentiator #2): one page consolidating a
 * single Booking's request, quote, messages, status, payment, completion, dispute, and review -
 * every action here calls a real, already-tested /v2 endpoint; nothing is simulated client-side.
 */
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiV2, storableApiV2Error } from '../../util/apiV2';

export const fetchBookingV2Thunk = createAsyncThunk(
  'projectPassportPageV2/fetchBooking',
  (bookingId, { rejectWithValue }) =>
    apiV2(`/api/v2/bookings/${bookingId}`).catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const fetchMessagesV2Thunk = createAsyncThunk(
  'projectPassportPageV2/fetchMessages',
  (bookingId, { rejectWithValue }) =>
    apiV2(`/api/v2/bookings/${bookingId}/messages`).catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const sendMessageV2Thunk = createAsyncThunk(
  'projectPassportPageV2/sendMessage',
  ({ bookingId, text }, { rejectWithValue }) =>
    apiV2(`/api/v2/bookings/${bookingId}/messages`, { method: 'POST', body: { text } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    )
);

export const respondV2Thunk = createAsyncThunk(
  'projectPassportPageV2/respond',
  ({ bookingId, action, quotedPrice }, { rejectWithValue }) =>
    apiV2(`/api/v2/bookings/${bookingId}/respond`, { method: 'POST', body: { action, quotedPrice } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    )
);

export const updateStatusV2Thunk = createAsyncThunk(
  'projectPassportPageV2/updateStatus',
  ({ bookingId, status, cancelReason, completionEvidencePhotos }, { rejectWithValue }) =>
    apiV2(`/api/v2/bookings/${bookingId}/status`, {
      method: 'POST',
      body: { status, cancelReason, completionEvidencePhotos },
    }).catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const confirmBookingV2Thunk = createAsyncThunk(
  'projectPassportPageV2/confirm',
  (bookingId, { rejectWithValue }) =>
    apiV2(`/api/v2/bookings/${bookingId}/confirm`, { method: 'POST' }).catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const disputeV2Thunk = createAsyncThunk(
  'projectPassportPageV2/dispute',
  ({ bookingId, reason }, { rejectWithValue }) =>
    apiV2(`/api/v2/bookings/${bookingId}/dispute`, { method: 'POST', body: { reason } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    )
);

export const disputeRespondV2Thunk = createAsyncThunk(
  'projectPassportPageV2/disputeRespond',
  ({ bookingId, response }, { rejectWithValue }) =>
    apiV2(`/api/v2/bookings/${bookingId}/dispute/respond`, { method: 'POST', body: { response } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    )
);

export const createPaymentIntentV2Thunk = createAsyncThunk(
  'projectPassportPageV2/createPaymentIntent',
  (bookingId, { rejectWithValue }) =>
    apiV2(`/api/v2/payments/bookings/${bookingId}/intent`, { method: 'POST' }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    )
);

export const submitReviewV2Thunk = createAsyncThunk(
  'projectPassportPageV2/submitReview',
  ({ bookingId, rating, comment }, { rejectWithValue }) =>
    apiV2(`/api/v2/reviews/bookings/${bookingId}`, { method: 'POST', body: { rating, comment } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    )
);

const initialState = {
  fetchInProgress: false,
  fetchError: null,
  booking: null,
  viewerRole: null,

  messages: [],
  messagesFetchInProgress: false,
  sendMessageInProgress: false,

  actionInProgress: false,
  actionError: null,

  paymentClientSecret: null,
  paymentIntentInProgress: false,
  paymentIntentError: null,

  reviewSubmitted: false,
};

const applyBookingUpdate = (state, booking) => {
  state.booking = booking;
};

const projectPassportPageV2Slice = createSlice({
  name: 'projectPassportPageV2',
  initialState,
  reducers: {
    clearActionError(state) {
      state.actionError = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchBookingV2Thunk.pending, state => {
        state.fetchInProgress = true;
        state.fetchError = null;
      })
      .addCase(fetchBookingV2Thunk.fulfilled, (state, action) => {
        state.fetchInProgress = false;
        state.booking = action.payload.booking;
        state.viewerRole = action.payload.viewerRole;
      })
      .addCase(fetchBookingV2Thunk.rejected, (state, action) => {
        state.fetchInProgress = false;
        state.fetchError = action.payload;
      })

      .addCase(fetchMessagesV2Thunk.pending, state => {
        state.messagesFetchInProgress = true;
      })
      .addCase(fetchMessagesV2Thunk.fulfilled, (state, action) => {
        state.messagesFetchInProgress = false;
        state.messages = action.payload.messages;
      })
      .addCase(fetchMessagesV2Thunk.rejected, state => {
        state.messagesFetchInProgress = false;
      })

      .addCase(sendMessageV2Thunk.pending, state => {
        state.sendMessageInProgress = true;
      })
      .addCase(sendMessageV2Thunk.fulfilled, (state, action) => {
        state.sendMessageInProgress = false;
        state.messages.push(action.payload.message);
      })
      .addCase(sendMessageV2Thunk.rejected, state => {
        state.sendMessageInProgress = false;
      })

      .addCase(createPaymentIntentV2Thunk.pending, state => {
        state.paymentIntentInProgress = true;
        state.paymentIntentError = null;
      })
      .addCase(createPaymentIntentV2Thunk.fulfilled, (state, action) => {
        state.paymentIntentInProgress = false;
        state.paymentClientSecret = action.payload.clientSecret;
      })
      .addCase(createPaymentIntentV2Thunk.rejected, (state, action) => {
        state.paymentIntentInProgress = false;
        state.paymentIntentError = action.payload;
      })

      .addCase(submitReviewV2Thunk.fulfilled, state => {
        state.reviewSubmitted = true;
      });

    // Every other action (respond/updateStatus/confirm/dispute/disputeRespond) shares the same
    // pending/fulfilled/rejected shape: a real in-progress flag, a real error, and - on success -
    // the fresh booking document straight from the server (never optimistically guessed).
    [respondV2Thunk, updateStatusV2Thunk, confirmBookingV2Thunk, disputeV2Thunk, disputeRespondV2Thunk].forEach(
      thunk => {
        builder
          .addCase(thunk.pending, state => {
            state.actionInProgress = true;
            state.actionError = null;
          })
          .addCase(thunk.fulfilled, (state, action) => {
            state.actionInProgress = false;
            applyBookingUpdate(state, action.payload.booking);
          })
          .addCase(thunk.rejected, (state, action) => {
            state.actionInProgress = false;
            state.actionError = action.payload;
          });
      }
    );
  },
});

export const { clearActionError } = projectPassportPageV2Slice.actions;
export default projectPassportPageV2Slice.reducer;
