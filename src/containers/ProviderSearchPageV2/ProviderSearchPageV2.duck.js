/**
 * src/containers/ProviderSearchPageV2/ProviderSearchPageV2.duck.js
 *
 * Public, new-backend provider search (Phase 3's "not yet wired to frontend" gap - see
 * MIGRATION_PLAN.md). Calls the real GET /api/v2/search/providers endpoint built and tested in
 * Phase 3 - a genuine $geoNear query when a location is known, category-filtered + rating-sorted
 * otherwise, and a real empty data:[] when nobody has registered in that category yet (never
 * fake/placeholder providers).
 *
 * Deliberately its own new page/route ('/providers-v2/:categorySlug') rather than replacing what
 * CategoryHero currently links to (Sharetribe's own SearchPage) - same reasoning as RidePageV2:
 * today's live category search works end-to-end on Sharetribe right now, so it stays untouched
 * until this new path is verified against a real deployment and someone deliberately switches the
 * homepage's link over - see MIGRATION_PLAN.md.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2Public, storableApiV2Error } from '../../util/apiV2';

export const searchProvidersV2Thunk = createAsyncThunk(
  'providerSearchPageV2/search',
  ({ categorySlug, lat, lng, radiusMiles }, { rejectWithValue }) => {
    const params = new URLSearchParams({ category: categorySlug });
    if (lat !== undefined && lng !== undefined) {
      params.set('lat', lat);
      params.set('lng', lng);
      if (radiusMiles) params.set('radiusMiles', radiusMiles);
    }
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
