/**
 * src/containers/AuthenticationPageV2/AuthenticationPageV2.duck.js
 *
 * The real sign-up/sign-in entry point for the whole Mongo-backed app - email + password against
 * the real, bcrypt-backed server/api/v2/auth/signup.js and login.js. This REPLACES the old
 * TestSignInPageV2 (name+email, no password, backed by server/api/v2/auth/test-signup.js): that
 * page was explicitly a "test mode" shim with no real credential, which contradicts the product
 * requirement that nothing in the shipped app be fake/placeholder. signup.js already defaults new
 * accounts to roles:['customer'] / activeMode:'customer' with no separate per-role signup flow,
 * exactly matching spec sections 1/2/4 - this page is just the real UI for it.
 */
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiV2Public, setAppUserToken, storableApiV2Error } from '../../util/apiV2';

export const signUpThunk = createAsyncThunk(
  'authenticationPageV2/signUp',
  ({ email, password, firstName, lastName }, { rejectWithValue }) => {
    return apiV2Public('/api/v2/auth/signup', {
      method: 'POST',
      body: { email, password, firstName, lastName },
    })
      .then(data => {
        setAppUserToken(data.token);
        return data;
      })
      .catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const logInThunk = createAsyncThunk(
  'authenticationPageV2/logIn',
  ({ email, password }, { rejectWithValue }) => {
    return apiV2Public('/api/v2/auth/login', {
      method: 'POST',
      body: { email, password },
    })
      .then(data => {
        setAppUserToken(data.token);
        return data;
      })
      .catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

const initialState = {
  submitInProgress: false,
  submitError: null,
  user: null,
};

const authenticationPageV2Slice = createSlice({
  name: 'authenticationPageV2',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.submitError = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(signUpThunk.pending, state => {
        state.submitInProgress = true;
        state.submitError = null;
      })
      .addCase(signUpThunk.fulfilled, (state, action) => {
        state.submitInProgress = false;
        state.user = action.payload.user;
      })
      .addCase(signUpThunk.rejected, (state, action) => {
        state.submitInProgress = false;
        state.submitError = action.payload;
      })
      .addCase(logInThunk.pending, state => {
        state.submitInProgress = true;
        state.submitError = null;
      })
      .addCase(logInThunk.fulfilled, (state, action) => {
        state.submitInProgress = false;
        state.user = action.payload.user;
      })
      .addCase(logInThunk.rejected, (state, action) => {
        state.submitInProgress = false;
        state.submitError = action.payload;
      });
  },
});

export const { clearAuthError } = authenticationPageV2Slice.actions;
export default authenticationPageV2Slice.reducer;
