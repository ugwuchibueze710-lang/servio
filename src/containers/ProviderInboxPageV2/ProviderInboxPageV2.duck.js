/**
 * src/containers/ProviderInboxPageV2/ProviderInboxPageV2.duck.js
 *
 * The real provider dashboard: this account's own Business profile (for real, server-computed
 * metrics and the "Accepting New Jobs" toggle - spec sections 27/28) plus every booking made
 * against it. Accept/decline/schedule/complete/cancel actions all now live on
 * ProjectPassportPageV2 (one real place per job, not duplicated status-machine logic here and
 * there - this used to have its own copy, which drifted out of sync with a real backend change
 * and got removed as a stale/contradicting file, see src/booking/bookingProcessV2.js removal).
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, storableApiV2Error } from '../../util/apiV2';

export const fetchMyBusinessV2Thunk = createAsyncThunk(
  'providerInboxPageV2/fetchMyBusiness',
  (_, { rejectWithValue }) => apiV2('/api/v2/providers/me').catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const fetchInboxV2Thunk = createAsyncThunk(
  'providerInboxPageV2/fetchInbox',
  (_, { rejectWithValue }) => apiV2('/api/v2/bookings/inbox').catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const setAcceptingJobsV2Thunk = createAsyncThunk(
  'providerInboxPageV2/setAcceptingJobs',
  (acceptingNewJobs, { rejectWithValue }) =>
    apiV2('/api/v2/providers/me/accepting-jobs', { method: 'PATCH', body: { acceptingNewJobs } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    )
);

const initialState = {
  business: null,
  fetchBusinessInProgress: false,
  fetchBusinessError: null,

  data: [],
  fetchInProgress: false,
  fetchError: null,
  noProviderProfileMessage: null,

  toggleInProgress: false,
  toggleError: null,
};

const providerInboxPageV2Slice = createSlice({
  name: 'providerInboxPageV2',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchMyBusinessV2Thunk.pending, state => {
        state.fetchBusinessInProgress = true;
        state.fetchBusinessError = null;
      })
      .addCase(fetchMyBusinessV2Thunk.fulfilled, (state, action) => {
        state.fetchBusinessInProgress = false;
        state.business = action.payload.business;
      })
      .addCase(fetchMyBusinessV2Thunk.rejected, (state, action) => {
        state.fetchBusinessInProgress = false;
        state.fetchBusinessError = action.payload;
      })

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

      .addCase(setAcceptingJobsV2Thunk.pending, state => {
        state.toggleInProgress = true;
        state.toggleError = null;
      })
      .addCase(setAcceptingJobsV2Thunk.fulfilled, (state, action) => {
        state.toggleInProgress = false;
        state.business = action.payload.business;
      })
      .addCase(setAcceptingJobsV2Thunk.rejected, (state, action) => {
        state.toggleInProgress = false;
        state.toggleError = action.payload;
      });
  },
});

export default providerInboxPageV2Slice.reducer;
