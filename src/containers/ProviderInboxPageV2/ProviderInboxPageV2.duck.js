/**
 * src/containers/ProviderInboxPageV2/ProviderInboxPageV2.duck.js
 *
 * A provider's real inbox of booking requests against their own Business (Phase 4's other still-
 * missing frontend half - see MIGRATION_PLAN.md). Calls the real, tested GET /api/v2/bookings/
 * inbox, POST /api/v2/bookings/:id/respond (accept/decline), and POST /api/v2/bookings/:id/status
 * (advance to scheduled/in_progress/completed, or cancel).
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, storableApiV2Error } from '../../util/apiV2';

export const fetchInboxV2Thunk = createAsyncThunk(
  'providerInboxPageV2/fetchInbox',
  (_, { rejectWithValue }) => {
    return apiV2('/api/v2/bookings/inbox').catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const respondBookingV2Thunk = createAsyncThunk(
  'providerInboxPageV2/respondBooking',
  ({ bookingId, action, quotedPrice }, { rejectWithValue }) => {
    return apiV2(`/api/v2/bookings/${bookingId}/respond`, {
      method: 'POST',
      body: { action, quotedPrice },
    }).catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const advanceBookingStatusV2Thunk = createAsyncThunk(
  'providerInboxPageV2/advanceStatus',
  ({ bookingId, status }, { rejectWithValue }) => {
    return apiV2(`/api/v2/bookings/${bookingId}/status`, {
      method: 'POST',
      body: { status },
    }).catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

const initialState = {
  data: [],
  fetchInProgress: false,
  fetchError: null,
  noProviderProfileMessage: null,

  actionInProgressId: null, // bookingId currently being responded to / advanced, if any
  actionError: null,
};

const upsertBooking = (state, updated) => {
  state.data = state.data.map(b => (b._id === updated._id ? updated : b));
};

const providerInboxPageV2Slice = createSlice({
  name: 'providerInboxPageV2',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchInboxV2Thunk.pending, state => {
        state.fetchInProgress = true;
        state.fetchError = null;
      })
      .addCase(fetchInboxV2Thunk.fulfilled, (state, action) => {
        state.fetchInProgress = false;
        state.data = action.payload.data;
        state.noProviderProfileMessage = action.payload.message || null;
      })
      .addCase(fetchInboxV2Thunk.rejected, (state, action) => {
        state.fetchInProgress = false;
        state.fetchError = action.payload;
      })
      .addCase(respondBookingV2Thunk.pending, (state, action) => {
        state.actionInProgressId = action.meta.arg.bookingId;
        state.actionError = null;
      })
      .addCase(respondBookingV2Thunk.fulfilled, (state, action) => {
        state.actionInProgressId = null;
        upsertBooking(state, action.payload.booking);
      })
      .addCase(respondBookingV2Thunk.rejected, (state, action) => {
        state.actionInProgressId = null;
        state.actionError = action.payload;
      })
      .addCase(advanceBookingStatusV2Thunk.pending, (state, action) => {
        state.actionInProgressId = action.meta.arg.bookingId;
        state.actionError = null;
      })
      .addCase(advanceBookingStatusV2Thunk.fulfilled, (state, action) => {
        state.actionInProgressId = null;
        upsertBooking(state, action.payload.booking);
      })
      .addCase(advanceBookingStatusV2Thunk.rejected, (state, action) => {
        state.actionInProgressId = null;
        state.actionError = action.payload;
      });
  },
});

export default providerInboxPageV2Slice.reducer;
