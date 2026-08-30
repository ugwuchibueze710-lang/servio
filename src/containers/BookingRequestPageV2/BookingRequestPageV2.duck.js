/**
 * src/containers/BookingRequestPageV2/BookingRequestPageV2.duck.js
 *
 * A customer's real service request against a specific provider (Phase 4's still-missing
 * frontend - see MIGRATION_PLAN.md). Calls the real, tested GET /api/v2/providers/:id (new
 * this change - see its own file header for why it didn't already exist) and
 * POST /api/v2/bookings.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, apiV2Public, storableApiV2Error } from '../../util/apiV2';

export const fetchBusinessV2Thunk = createAsyncThunk(
  'bookingRequestPageV2/fetchBusiness',
  (businessId, { rejectWithValue }) => {
    return apiV2Public(`/api/v2/providers/${businessId}`).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

export const createBookingV2Thunk = createAsyncThunk(
  'bookingRequestPageV2/createBooking',
  (body, { rejectWithValue }) => {
    return apiV2('/api/v2/bookings', { method: 'POST', body }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

const initialState = {
  business: null,
  fetchBusinessInProgress: false,
  fetchBusinessError: null,

  createInProgress: false,
  createError: null,
  createdBooking: null,
};

const bookingRequestPageV2Slice = createSlice({
  name: 'bookingRequestPageV2',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchBusinessV2Thunk.pending, state => {
        state.fetchBusinessInProgress = true;
        state.fetchBusinessError = null;
      })
      .addCase(fetchBusinessV2Thunk.fulfilled, (state, action) => {
        state.fetchBusinessInProgress = false;
        state.business = action.payload.business;
      })
      .addCase(fetchBusinessV2Thunk.rejected, (state, action) => {
        state.fetchBusinessInProgress = false;
        state.fetchBusinessError = action.payload;
      })
      .addCase(createBookingV2Thunk.pending, state => {
        state.createInProgress = true;
        state.createError = null;
      })
      .addCase(createBookingV2Thunk.fulfilled, (state, action) => {
        state.createInProgress = false;
        state.createdBooking = action.payload.booking;
      })
      .addCase(createBookingV2Thunk.rejected, (state, action) => {
        state.createInProgress = false;
        state.createError = action.payload;
      });
  },
});

export default bookingRequestPageV2Slice.reducer;
