/**
 * src/containers/ProviderPublicProfilePageV2/ProviderPublicProfilePageV2.duck.js
 *
 * The real, public-facing provider profile (spec sections 11, 12, 20): portfolio, structured
 * services/pricing, and reviews - all fetched from the real backend (GET /api/v2/providers/:id,
 * GET /api/v2/reviews/business/:businessId). A business with zero reviews gets a real empty
 * list, never fabricated testimonials.
 */
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiV2Public, storableApiV2Error } from '../../util/apiV2';

export const fetchProviderProfileV2Thunk = createAsyncThunk(
  'providerPublicProfilePageV2/fetch',
  async ({ businessId }, { rejectWithValue }) => {
    try {
      const [businessData, reviewsData] = await Promise.all([
        apiV2Public(`/api/v2/providers/${businessId}`),
        apiV2Public(`/api/v2/reviews/business/${businessId}`),
      ]);
      return { business: businessData.business, reviews: reviewsData.data };
    } catch (e) {
      return rejectWithValue(storableApiV2Error(e));
    }
  }
);

const initialState = {
  fetchInProgress: false,
  fetchError: null,
  business: null,
  reviews: [],
};

const providerPublicProfilePageV2Slice = createSlice({
  name: 'providerPublicProfilePageV2',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchProviderProfileV2Thunk.pending, state => {
        state.fetchInProgress = true;
        state.fetchError = null;
      })
      .addCase(fetchProviderProfileV2Thunk.fulfilled, (state, action) => {
        state.fetchInProgress = false;
        state.business = action.payload.business;
        state.reviews = action.payload.reviews;
      })
      .addCase(fetchProviderProfileV2Thunk.rejected, (state, action) => {
        state.fetchInProgress = false;
        state.fetchError = action.payload;
        state.business = null;
      });
  },
});

export default providerPublicProfilePageV2Slice.reducer;
