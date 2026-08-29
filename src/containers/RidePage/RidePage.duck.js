import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { storableError } from '../../util/errors';
import { rideInitiatePrivileged, rideTransitionPrivileged } from '../../util/api';
import { confirmCardPayment } from '../../ducks/stripe.duck';
import { transitions, states, ACTIVE_TRIP_STATES } from '../../ride/rideProcess';

// ================ Helpers ================ //

// Sharetribe transaction resources come back with the last transition name
// under attributes.lastTransition and the process state has to be derived
// by replaying the graph - simplified here to "read protectedData/metadata
// we ourselves wrote", which is enough for the UI states this page needs.
// A full replay against rideProcess.js's `graph` is the more rigorous
// version of this and is a reasonable Phase 2 hardening item once this is
// exercised against real transactions.
const deriveUiState = transaction => {
  const lastTransition = transaction?.attributes?.lastTransition;
  const stateFromTransition = {
    [transitions.REQUEST_PAYMENT]: states.PENDING_PAYMENT,
    [transitions.CONFIRM_PAYMENT]: states.AWAITING_DRIVER_ACCEPTANCE,
    [transitions.DRIVER_ACCEPT]: states.DRIVER_ASSIGNED,
    [transitions.DRIVER_DECLINE]: states.NO_DRIVER_RESPONSE,
    [transitions.DRIVER_TIMEOUT]: states.NO_DRIVER_RESPONSE,
    [transitions.DRIVER_EN_ROUTE]: states.DRIVER_EN_ROUTE_TO_PICKUP,
    [transitions.DRIVER_ARRIVED]: states.DRIVER_ARRIVED,
    [transitions.START_TRIP]: states.TRIP_IN_PROGRESS,
    [transitions.COMPLETE_TRIP]: states.TRIP_COMPLETED,
    [transitions.PAYOUT]: states.COMPLETED,
    [transitions.CANCEL_BY_RIDER_FREE]: states.CANCELLED_BY_RIDER,
    [transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_ASSIGNED]: states.CANCELLED_BY_RIDER_WITH_FEE,
    [transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_EN_ROUTE]: states.CANCELLED_BY_RIDER_WITH_FEE,
    [transitions.CANCEL_BY_RIDER_WITH_FEE_FROM_ARRIVED]: states.CANCELLED_BY_RIDER_WITH_FEE,
    [transitions.CANCEL_BY_DRIVER_FROM_ASSIGNED]: states.CANCELLED_BY_DRIVER,
    [transitions.CANCEL_BY_DRIVER_FROM_EN_ROUTE]: states.CANCELLED_BY_DRIVER,
  };
  return stateFromTransition[lastTransition] || states.INITIAL;
};

// ================ Thunks ================ //

/**
 * Ask the backend to pick the best nearby driver and open a PaymentIntent
 * for the estimated fare. See server/api/ride-initiate-privileged.js - this
 * is a privileged call because the server, not the client, decides which
 * listing (driver) the transaction is created against.
 */
export const requestRideThunk = createAsyncThunk(
  'ridePage/requestRide',
  ({ pickup, destination, distanceInMeters, durationInSeconds, rideType, excludeListingIds }, { rejectWithValue }) => {
    const bodyParams = { transition: transitions.REQUEST_PAYMENT, params: {} };
    const orderData = { pickup, destination, distanceInMeters, durationInSeconds, rideType, excludeListingIds };
    return rideInitiatePrivileged({ isSpeculative: false, orderData, bodyParams, queryParams: {} })
      .then(response => response.data.data)
      .catch(e => rejectWithValue({ error: storableError(e), noDriverFound: e?.data?.code === 'NO_DRIVER_FOUND' }));
  }
);

/** Confirms the card payment with Stripe, then tells Sharetribe the payment is confirmed. */
export const confirmRidePaymentThunk = createAsyncThunk(
  'ridePage/confirmPayment',
  ({ transactionId, stripe, paymentParams, stripePaymentIntentClientSecret }, { dispatch, rejectWithValue }) => {
    return dispatch(
      confirmCardPayment({ orderId: transactionId, stripe, paymentParams, stripePaymentIntentClientSecret })
    )
      .then(() =>
        rideTransitionPrivileged({
          bodyParams: { id: transactionId, transition: transitions.CONFIRM_PAYMENT, params: {} },
        })
      )
      .then(response => response.data.data)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

/** Polls the transaction so the map/status view reflects real backend state, not optimistic UI. */
export const pollRideStatusThunk = createAsyncThunk(
  'ridePage/pollStatus',
  (transactionId, { extra: sdk, rejectWithValue }) => {
    return sdk.transactions
      .show({ id: transactionId, include: ['provider', 'listing'] })
      .then(response => response.data)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

export const cancelRideThunk = createAsyncThunk(
  'ridePage/cancelRide',
  ({ transactionId, transition }, { rejectWithValue }) => {
    return rideTransitionPrivileged({ bodyParams: { id: transactionId, transition, params: {} } })
      .then(response => response.data.data)
      .catch(e => rejectWithValue(storableError(e)));
  }
);

// ================ Slice ================ //

const initialState = {
  pickup: null, // { lat, lng, address }
  destination: null, // { lat, lng, address }
  routeEstimate: null, // { distanceInMeters, durationInSeconds, routePolyline }
  fareEstimate: null, // calculateRideFare() result
  excludeListingIds: [], // candidates already tried this ride request (decline/timeout retry loop)

  requestInProgress: false,
  requestError: null,
  noDriverFound: false,

  transactionId: null,
  transaction: null,
  driverListing: null,
  uiState: states.INITIAL,

  confirmInProgress: false,
  confirmError: null,

  cancelInProgress: false,
  cancelError: null,
};

const ridePageSlice = createSlice({
  name: 'ridePage',
  initialState,
  reducers: {
    setPickup: (state, action) => {
      state.pickup = action.payload;
    },
    setDestination: (state, action) => {
      state.destination = action.payload;
    },
    setRouteAndFare: (state, action) => {
      state.routeEstimate = action.payload.routeEstimate;
      state.fareEstimate = action.payload.fareEstimate;
    },
    // Clears the in-flight transaction so the UI can start a fresh request,
    // WITHOUT clearing excludeListingIds - see retryWithNextDriver below,
    // used when the previous candidate declined/timed out (spec section 8).
    resetRideRequest: state => {
      state.transactionId = null;
      state.transaction = null;
      state.uiState = states.INITIAL;
      state.requestError = null;
      state.noDriverFound = false;
    },
    // Fully clears everything, including the exclude list - used when the
    // rider abandons this ride request entirely (e.g. changes destination).
    clearRideRequest: state => {
      Object.assign(state, initialState);
    },
    retryWithNextDriver: (state, action) => {
      if (action.payload && !state.excludeListingIds.includes(action.payload)) {
        state.excludeListingIds.push(action.payload);
      }
      state.transactionId = null;
      state.transaction = null;
      state.uiState = states.INITIAL;
      state.requestError = null;
      state.noDriverFound = false;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(requestRideThunk.pending, state => {
        state.requestInProgress = true;
        state.requestError = null;
        state.noDriverFound = false;
      })
      .addCase(requestRideThunk.fulfilled, (state, action) => {
        state.requestInProgress = false;
        state.transactionId = action.payload.id;
        state.transaction = action.payload;
        state.uiState = states.PENDING_PAYMENT;
      })
      .addCase(requestRideThunk.rejected, (state, action) => {
        state.requestInProgress = false;
        state.requestError = action.payload?.error;
        state.noDriverFound = !!action.payload?.noDriverFound;
      })
      .addCase(confirmRidePaymentThunk.pending, state => {
        state.confirmInProgress = true;
        state.confirmError = null;
      })
      .addCase(confirmRidePaymentThunk.fulfilled, (state, action) => {
        state.confirmInProgress = false;
        state.transaction = action.payload;
        state.uiState = states.AWAITING_DRIVER_ACCEPTANCE;
      })
      .addCase(confirmRidePaymentThunk.rejected, (state, action) => {
        state.confirmInProgress = false;
        state.confirmError = action.payload;
      })
      .addCase(pollRideStatusThunk.fulfilled, (state, action) => {
        const transaction = action.payload.data;
        const included = action.payload.included || [];
        const listingRef = transaction?.relationships?.listing?.data;
        const listing = included.find(i => i.type === 'listing' && i.id.uuid === listingRef?.id?.uuid);
        state.transaction = transaction;
        // Live driver position comes from the driver's own listing
        // `geolocation` (continuously updated by DriverRidePage's odometer
        // hook - see server/api-util/rideDispatch.js's module comment for
        // why this lives on the listing rather than transaction
        // protectedData: Sharetribe only mutates protectedData as part of
        // a state-changing transition, not a standalone "just update this
        // field" call, so it's the wrong shape for a value that changes
        // every few seconds without any ride-state change).
        state.driverListing = listing || null;
        state.uiState = deriveUiState(transaction);
      })
      .addCase(cancelRideThunk.pending, state => {
        state.cancelInProgress = true;
        state.cancelError = null;
      })
      .addCase(cancelRideThunk.fulfilled, (state, action) => {
        state.cancelInProgress = false;
        state.transaction = action.payload;
        state.uiState = deriveUiState(action.payload);
      })
      .addCase(cancelRideThunk.rejected, (state, action) => {
        state.cancelInProgress = false;
        state.cancelError = action.payload;
      });
  },
});

export const {
  setPickup,
  setDestination,
  setRouteAndFare,
  resetRideRequest,
  clearRideRequest,
  retryWithNextDriver,
} = ridePageSlice.actions;
export const isActiveTripUiState = uiState => ACTIVE_TRIP_STATES.includes(uiState);
// Reads the driver's live position off their listing's `geolocation` -
// see the pollRideStatusThunk.fulfilled comment above for why.
export const rideDriverLocationSelector = driverListing => {
  const geolocation = driverListing?.attributes?.geolocation;
  return geolocation ? { lat: geolocation.lat, lng: geolocation.lng } : null;
};

export default ridePageSlice.reducer;
