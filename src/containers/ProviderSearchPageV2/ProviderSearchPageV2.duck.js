/**
 * src/containers/ProviderSearchPageV2/ProviderSearchPageV2.duck.js
 *
 * Public, real-backend provider search (spec sections 2/3/9/10). Calls the real
 * GET /api/v2/search/providers endpoint - a genuine $geoNear query when a location is known
 * (customer radius AND the provider's own service radius both enforced server-side), a real
 * ranked list otherwise, and a real empty data:[] when nobody has registered in that category
 * yet (never fake/placeholder providers). `sort` is a visible, user-controlled option (spec's
 * "ranking system with visible sort options") - the server computes the actual ranking score;
 * this just tells it which order to apply.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2Public, storableApiV2Error } from '../../util/apiV2';

export const searchProvidersV2Thunk = createAsyncThunk(
  'providerSearchPageV2/search',
  ({ categorySlug, lat, lng, radiusMiles, sort, q }, { rejectWithValue }) => {
    const params = new URLSearchParams({ category: categorySlug });
    if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
      params.set('lat', lat);
      params.set('lng', lng);
      if (radiusMiles) params.set('radiusMiles', radiusMiles);
    }
    if (sort) params.set('sort', sort);
    if (q) params.set('q', q);
    return apiV2Public(`/api/v2/search/providers?${params.toString()}`).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

const initialState = {
  categorySlug: null,
  categoryName: null,
  searchInProgress: false,
  searchError: null,
  data: [],
  searchedNear: null,
  sort: 'recommended',
  notFound: false, // real 404 - this category slug doesn't exist, distinct from "no providers yet"
};

const providerSearchPageV2Slice = createSlice({
  name: 'providerSearchPageV2',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(searchProvidersV2Thunk.pending, (state, action) => {
        state.searchInProgress = true;
        state.searchError = null;
        state.notFound = false;
        state.categorySlug = action.meta.arg.categorySlug;
      })
      .addCase(searchProvidersV2Thunk.fulfilled, (state, action) => {
        state.searchInProgress = false;
        state.data = action.payload.data;
        state.categoryName = action.payload.category?.name || null;
        state.searchedNear = action.payload.searchedNear;
        state.sort = action.payload.sort || 'recommended';
      })
      .addCase(searchProvidersV2Thunk.rejected, (state, action) => {
        state.searchInProgress = false;
        state.searchError = action.payload;
        state.notFound = action.payload?.status === 404;
        state.data = [];
      });
  },
});

export default providerSearchPageV2Slice.reducer;
