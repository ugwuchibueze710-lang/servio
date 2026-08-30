/**
 * src/containers/ProviderProfilePageV2/ProviderProfilePageV2.duck.js
 *
 * Provider onboarding/editing for the new backend (Phase 3's "provider profile UI" gap - see
 * MIGRATION_PLAN.md). Calls the real, tested POST/GET /api/v2/providers/me endpoints; categories
 * come from the same public GET /api/v2/categories endpoint the homepage's CategoryHero already
 * uses, so the category picker here is never a hand-typed, potentially-stale list.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, apiV2Public, storableApiV2Error } from '../../util/apiV2';

export const fetchCategoriesV2Thunk = createAsyncThunk(
  'providerProfilePageV2/fetchCategories',
  (_, { rejectWithValue }) => {
    return apiV2Public('/api/v2/categories').catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const fetchMyProviderV2Thunk = createAsyncThunk(
  'providerProfilePageV2/fetchMyProvider',
  (_, { rejectWithValue }) => {
    return apiV2('/api/v2/providers/me').catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const upsertProviderV2Thunk = createAsyncThunk(
  'providerProfilePageV2/upsertProvider',
  (body, { rejectWithValue }) => {
    return apiV2('/api/v2/providers/me', { method: 'POST', body }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

export const connectOnboardV2Thunk = createAsyncThunk(
  'providerProfilePageV2/connectOnboard',
  (_, { rejectWithValue }) =>
    apiV2('/api/v2/payments/connect/onboard', { method: 'POST' }).catch(e => rejectWithValue(storableApiV2Error(e)))
);

export const connectStatusV2Thunk = createAsyncThunk(
  'providerProfilePageV2/connectStatus',
  (_, { rejectWithValue }) =>
    apiV2('/api/v2/payments/connect/status').catch(e => rejectWithValue(storableApiV2Error(e)))
);

const initialState = {
  categories: [],
  fetchCategoriesInProgress: false,

  business: null, // null until fetched; then either a real Business or null (no profile yet)
  fetchBusinessInProgress: false,

  saveInProgress: false,
  saveError: null,
  savedJustNow: false,

  connectStatus: null,
  connectStatusInProgress: false,
  connectOnboardInProgress: false,
  connectOnboardError: null,
};

const providerProfilePageV2Slice = createSlice({
  name: 'providerProfilePageV2',
  initialState,
  reducers: {
    clearSavedJustNowV2: state => {
      state.savedJustNow = false;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchCategoriesV2Thunk.pending, state => {
        state.fetchCategoriesInProgress = true;
      })
      .addCase(fetchCategoriesV2Thunk.fulfilled, (state, action) => {
        state.fetchCategoriesInProgress = false;
        state.categories = action.payload.data;
      })
      .addCase(fetchCategoriesV2Thunk.rejected, state => {
        state.fetchCategoriesInProgress = false;
      })
      .addCase(fetchMyProviderV2Thunk.pending, state => {
        state.fetchBusinessInProgress = true;
      })
      .addCase(fetchMyProviderV2Thunk.fulfilled, (state, action) => {
        state.fetchBusinessInProgress = false;
        state.business = action.payload.business;
      })
      .addCase(fetchMyProviderV2Thunk.rejected, state => {
        state.fetchBusinessInProgress = false;
      })
      .addCase(upsertProviderV2Thunk.pending, state => {
        state.saveInProgress = true;
        state.saveError = null;
        state.savedJustNow = false;
      })
      .addCase(upsertProviderV2Thunk.fulfilled, (state, action) => {
        state.saveInProgress = false;
        state.business = action.payload.business;
        state.savedJustNow = true;
      })
      .addCase(upsertProviderV2Thunk.rejected, (state, action) => {
        state.saveInProgress = false;
        state.saveError = action.payload;
      })
      .addCase(connectOnboardV2Thunk.pending, state => {
        state.connectOnboardInProgress = true;
        state.connectOnboardError = null;
      })
      .addCase(connectOnboardV2Thunk.fulfilled, state => {
        state.connectOnboardInProgress = false;
      })
      .addCase(connectOnboardV2Thunk.rejected, (state, action) => {
        state.connectOnboardInProgress = false;
        state.connectOnboardError = action.payload;
      })
      .addCase(connectStatusV2Thunk.pending, state => {
        state.connectStatusInProgress = true;
      })
      .addCase(connectStatusV2Thunk.fulfilled, (state, action) => {
        state.connectStatusInProgress = false;
        state.connectStatus = action.payload;
      })
      .addCase(connectStatusV2Thunk.rejected, state => {
        state.connectStatusInProgress = false;
      });
  },
});

export const { clearSavedJustNowV2 } = providerProfilePageV2Slice.actions;
export default providerProfilePageV2Slice.reducer;
