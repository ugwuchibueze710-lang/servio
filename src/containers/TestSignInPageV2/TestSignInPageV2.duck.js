/**
 * src/containers/TestSignInPageV2/TestSignInPageV2.duck.js
 *
 * The new backend's "test mode" sign-in: name + email, no password, real MongoDB AppUser under
 * the hood (see server/api/v2/auth/testSignup.js). This is the entry point for every other
 * -v2 page (ProviderProfilePageV2, BookingRequestPageV2, RidePageV2, etc.) now that they no
 * longer require a Sharetribe login to reach - see routeConfiguration.js.
 */
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiV2Public, setAppUserToken, storableApiV2Error } from '../../util/apiV2';

export const testSignInThunk = createAsyncThunk(
  'testSignInPageV2/signIn',
  ({ email, firstName, lastName, role }, { rejectWithValue }) => {
    return apiV2Public('/api/v2/auth/test-signup', {
      method: 'POST',
      body: { email, firstName, lastName, role },
    })
      .then(data => {
        setAppUserToken(data.token);
        return data;
      })
      .catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

const initialState = {
  signInInProgress: false,
  signInError: null,
  user: null,
};

const testSignInPageV2Slice = createSlice({
  name: 'testSignInPageV2',
  initialState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(testSignInThunk.pending, state => {
        state.signInInProgress = true;
        state.signInError = null;
      })
      .addCase(testSignInThunk.fulfilled, (state, action) => {
        state.signInInProgress = false;
        state.user = action.payload.user;
      })
      .addCase(testSignInThunk.rejected, (state, action) => {
        state.signInInProgress = false;
        state.signInError = action.payload;
      });
  },
});

export default testSignInPageV2Slice.reducer;
