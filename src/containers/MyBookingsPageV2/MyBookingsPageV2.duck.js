/**
 * src/containers/MyBookingsPageV2/MyBookingsPageV2.duck.js
 *
 * The real customer dashboard: this account's own bookings (GET /api/v2/bookings/mine) and
 * saved/favorite providers (GET /api/v2/me/saved-providers - spec section 21). Payment,
 * cancellation, confirm/dispute, and messaging all now live on ProjectPassportPageV2 - one real
 * place per job, not duplicated here. (This used to have its own Stripe payment wiring; it
 * turned out to pass the wrong shape of params into stripe.confirmCardPayment - see
 * ProjectPassportPageV2's BookingPaymentForm for the real, working replacement - so it was
 * removed rather than left as a second, broken payment path.)
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, storableApiV2Error } from '../../util/apiV2';

export const fetchMyBookingsV2Thunk = createAsyncThunk(
  'myBookingsPageV2/fetchBookings',
  (_, { rejectWithValue }) => apiV2('/api/v2/bookings/mine').catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const fetchSavedProvidersV2Thunk = createAsyncThunk(
  'myBookingsPageV2/fetchSavedProviders',
  (_, { rejectWithValue }) =>
    apiV2('/api/v2/me/saved-providers').catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const unsaveProviderV2Thunk = createAsyncThunk(
  'myBookingsPageV2/unsaveProvider',
  (businessId, { rejectWithValue }) =>
    apiV2(`/api/v2/me/saved-providers/${businessId}`, { method: 'DELETE' })
      .then(() => businessId)
      .catch(e => rejectWithValue(storableApiV2Error(e)))
);

const initialState = {
  data: [],
  fetchInProgress: false,
  fetchError: null,

  savedProviders: [],
  fetchSavedInProgress: false,
  fetchSavedError: null,
};

const myBookingsPageV2Slice = createSlice({
  name: 'myBookingsPageV2',
  initialState,
  reducers: {},
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

      .addCase(fetchSavedProvidersV2Thunk.pending, state => {
        state.fetchSavedInProgress = true;
        state.fetchSavedError = null;
      })
      .addCase(fetchSavedProvidersV2Thunk.fulfilled, (state, action) => {
        state.fetchSavedInProgress = false;
        state.savedProviders = action.payload.data;
      })
      .addCase(fetchSavedProvidersV2Thunk.rejected, (state, action) => {
        state.fetchSavedInProgress = false;
        state.fetchSavedError = action.payload;
      })

      .addCase(unsaveProviderV2Thunk.fulfilled, (state, action) => {
        state.savedProviders = state.savedProviders.filter(b => String(b._id) !== String(action.payload));
      });
  },
});

export default myBookingsPageV2Slice.reducer;
