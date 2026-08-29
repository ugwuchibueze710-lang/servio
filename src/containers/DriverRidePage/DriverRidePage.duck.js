import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { storableError } from '../../util/errors';
import { rideTransitionPrivileged } from '../../util/api';
import { transitions } from '../../ride/rideProcess';
import { LISTING_PUBLIC_DATA } from '../../ride/rideDataSchema';

// ================ Thunks ================ //

/** The current user's own Ride listing, if they've onboarded as a driver (spec section 3/16). */
export const fetchOwnDriverListingThunk = createAsyncThunk(
  'driverRidePage/fetchOwnListing',
  (_, { extra: sdk, rejectWithValue }) => {
    return sdk.ownListings
      .query({ pub_listingType: 'ride-driver' })
      .then(response => response.data.data[0] || null)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

/** Real online/offline toggle - this is the flag rideDispatch.js's public search filters on. */
export const setOnlineStatusThunk = createAsyncThunk(
  'driverRidePage/setOnlineStatus',
  ({ listingId, isOnline, geolocation }, { extra: sdk, rejectWithValue }) => {
    const geolocationMaybe = geolocation ? { geolocation } : {};
    return sdk.ownListings
      .update({ id: listingId, publicData: { [LISTING_PUBLIC_DATA.IS_ONLINE]: isOnline }, ...geolocationMaybe })
      .then(response => response.data.data)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

/** Throttled idle-location update while online but not on a trip (see rideDirections.js module comment). */
export const updateIdleLocationThunk = createAsyncThunk(
  'driverRidePage/updateIdleLocation',
  ({ listingId, geolocation }, { extra: sdk, rejectWithValue }) => {
    return sdk.ownListings
      .update({ id: listingId, geolocation })
      .then(response => response.data.data)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

/**
 * Poll for an incoming ride request assigned to this driver. Sharetribe's
 * `lastTransitions` + `only: 'sale'` query filters to transactions where
 * this user is the provider and the most recent transition matches - a
 * real, indexed query, not client-side filtering of everything.
 */
export const fetchIncomingRequestThunk = createAsyncThunk(
  'driverRidePage/fetchIncomingRequest',
  (_, { extra: sdk, rejectWithValue }) => {
    return sdk.transactions
      .query({ only: 'sale', lastTransitions: [transitions.CONFIRM_PAYMENT], include: ['customer'] })
      .then(response => response.data.data[0] || null)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

/** Any transaction currently past acceptance and not yet finished - drives the "active trip" screen. */
export const fetchActiveTripThunk = createAsyncThunk(
  'driverRidePage/fetchActiveTrip',
  (_, { extra: sdk, rejectWithValue }) => {
    return sdk.transactions
      .query({
        only: 'sale',
        lastTransitions: [
          transitions.DRIVER_ACCEPT,
          transitions.DRIVER_EN_ROUTE,
          transitions.DRIVER_ARRIVED,
          transitions.START_TRIP,
        ],
        include: ['customer'],
      })
      .then(response => response.data.data[0] || null)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

const simpleTransition = (transitionName, extraParams = {}) => (transactionId, sdk) =>
  sdk.transactions.transition({ id: transactionId, transition: transitionName, params: extraParams }, {});

export const acceptRideThunk = createAsyncThunk(
  'driverRidePage/acceptRide',
  (transactionId, { rejectWithValue }) => {
    // Privileged - see rideProcess.js isPrivileged() comment: this is
    // routed through the backend so lockDriverListing always runs.
    return rideTransitionPrivileged({
      bodyParams: { id: transactionId, transition: transitions.DRIVER_ACCEPT, params: {} },
    })
      .then(response => response.data.data)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

export const declineRideThunk = createAsyncThunk(
  'driverRidePage/declineRide',
  (transactionId, { extra: sdk, rejectWithValue }) => {
    return simpleTransition(transitions.DRIVER_DECLINE)(transactionId, sdk)
      .then(response => response.data.data)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

export const markEnRouteThunk = createAsyncThunk(
  'driverRidePage/markEnRoute',
  (transactionId, { extra: sdk, rejectWithValue }) =>
    simpleTransition(transitions.DRIVER_EN_ROUTE)(transactionId, sdk)
      .then(r => r.data.data)
      .catch(e => rejectWithValue(storableError(e)))
);

export const markArrivedThunk = createAsyncThunk(
  'driverRidePage/markArrived',
  (transactionId, { extra: sdk, rejectWithValue }) =>
    simpleTransition(transitions.DRIVER_ARRIVED)(transactionId, sdk)
      .then(r => r.data.data)
      .catch(e => rejectWithValue(storableError(e)))
);

export const startTripThunk = createAsyncThunk(
  'driverRidePage/startTrip',
  (transactionId, { extra: sdk, rejectWithValue }) =>
    simpleTransition(transitions.START_TRIP)(transactionId, sdk)
      .then(r => r.data.data)
      .catch(e => rejectWithValue(storableError(e)))
);

/**
 * Ends the trip with the ACTUALLY recorded distance/duration (accumulated
 * client-side from real GPS samples during the trip - see
 * DriverRidePage.js's `useTripOdometer` hook), never the original
 * estimate. Privileged because it recomputes and captures the real fare.
 */
export const completeTripThunk = createAsyncThunk(
  'driverRidePage/completeTrip',
  ({ transactionId, actualDistanceInMeters, actualDurationInSeconds }, { rejectWithValue }) => {
    return rideTransitionPrivileged({
      orderData: { actualDistanceInMeters, actualDurationInSeconds },
      bodyParams: { id: transactionId, transition: transitions.COMPLETE_TRIP, params: {} },
    })
      .then(response => response.data.data)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

// ================ Slice ================ //

const initialState = {
  ownListing: null,
  fetchListingInProgress: false,

  isOnline: false,
  toggleOnlineInProgress: false,
  toggleOnlineError: null,

  incomingRequest: null,
  activeTrip: null,

  acceptInProgress: false,
  acceptError: null,
  completeInProgress: false,
  completeError: null,
};

const driverRidePageSlice = createSlice({
  name: 'driverRidePage',
  initialState,
  reducers: {
    clearIncomingRequest: state => {
      state.incomingRequest = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchOwnDriverListingThunk.pending, state => {
        state.fetchListingInProgress = true;
      })
      .addCase(fetchOwnDriverListingThunk.fulfilled, (state, action) => {
        state.fetchListingInProgress = false;
        state.ownListing = action.payload;
        state.isOnline = !!action.payload?.attributes?.publicData?.[LISTING_PUBLIC_DATA.IS_ONLINE];
      })
      .addCase(setOnlineStatusThunk.pending, state => {
        state.toggleOnlineInProgress = true;
        state.toggleOnlineError = null;
      })
      .addCase(setOnlineStatusThunk.fulfilled, (state, action) => {
        state.toggleOnlineInProgress = false;
        state.ownListing = action.payload;
        state.isOnline = !!action.payload?.attributes?.publicData?.[LISTING_PUBLIC_DATA.IS_ONLINE];
      })
      .addCase(setOnlineStatusThunk.rejected, (state, action) => {
        state.toggleOnlineInProgress = false;
        state.toggleOnlineError = action.payload;
      })
      .addCase(fetchIncomingRequestThunk.fulfilled, (state, action) => {
        state.incomingRequest = action.payload;
      })
      .addCase(fetchActiveTripThunk.fulfilled, (state, action) => {
        state.activeTrip = action.payload;
      })
      .addCase(acceptRideThunk.pending, state => {
        state.acceptInProgress = true;
        state.acceptError = null;
      })
      .addCase(acceptRideThunk.fulfilled, (state, action) => {
        state.acceptInProgress = false;
        state.incomingRequest = null;
        state.activeTrip = action.payload;
      })
      .addCase(acceptRideThunk.rejected, (state, action) => {
        state.acceptInProgress = false;
        state.acceptError = action.payload;
      })
      .addCase(declineRideThunk.fulfilled, state => {
        state.incomingRequest = null;
      })
      .addCase(markEnRouteThunk.fulfilled, (state, action) => {
        state.activeTrip = action.payload;
      })
      .addCase(markArrivedThunk.fulfilled, (state, action) => {
        state.activeTrip = action.payload;
      })
      .addCase(startTripThunk.fulfilled, (state, action) => {
        state.activeTrip = action.payload;
      })
      .addCase(completeTripThunk.pending, state => {
        state.completeInProgress = true;
        state.completeError = null;
      })
      .addCase(completeTripThunk.fulfilled, state => {
        state.completeInProgress = false;
        state.activeTrip = null;
      })
      .addCase(completeTripThunk.rejected, (state, action) => {
        state.completeInProgress = false;
        state.completeError = action.payload;
      });
  },
});

export const { clearIncomingRequest } = driverRidePageSlice.actions;
export default driverRidePageSlice.reducer;
