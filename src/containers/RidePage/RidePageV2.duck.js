/**
 * src/containers/RidePage/RidePageV2.duck.js
 *
 * The new-backend equivalent of RidePage.duck.js - calls /api/v2/rides + /api/v2/payments instead
 * of the Sharetribe-based server/api/ride-initiate-privileged.js / ride-transition-privileged.js.
 * See src/ride/rideProcessV2.js's header for the real behavior differences from the live version
 * (broadcast dispatch instead of sequential retry, post-trip payment instead of pre-auth, no
 * fee-tiered cancellation yet) - this duck reflects those honestly rather than papering over them.
 *
 * Deliberately its own redux slice ('ridePageV2'), not a modification of RidePage.duck.js's
 * 'ridePage' slice - RidePage.js (the live page) is untouched by this file entirely. See
 * RidePageV2.js and the new '/ride-v2' route in routeConfiguration.js for how this gets used.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, storableApiV2Error } from '../../util/apiV2';
import { confirmCardPayment } from '../../ducks/stripe.duck';
import { uiStates, rideStatuses } from '../../ride/rideProcessV2';

// ================ Thunks ================ //

/** Real driver matching happens synchronously inside this call - see server/api/v2/rides/create.js. */
export const requestRideV2Thunk = createAsyncThunk(
  'ridePageV2/requestRide',
  ({ pickup, destination, distanceInMeters, durationInSeconds }, { rejectWithValue }) => {
    return apiV2('/api/v2/rides', {
      method: 'POST',
      body: { pickup, destination, distanceInMeters, durationInSeconds },
    }).catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

/** Polls the ride so the map/status view reflects real backend state, not optimistic UI. */
export const pollRideStatusV2Thunk = createAsyncThunk(
  'ridePageV2/pollStatus',
  (rideId, { rejectWithValue }) => {
    return apiV2(`/api/v2/rides/${rideId}`).catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const cancelRideV2Thunk = createAsyncThunk(
  'ridePageV2/cancelRide',
  ({ rideId, cancelReason }, { rejectWithValue }) => {
    return apiV2(`/api/v2/rides/${rideId}/cancel`, { method: 'POST', body: { cancelReason } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

/** Only callable once the ride is really trip_completed - see server/api/v2/payments/createRideIntent.js. */
export const createRidePaymentIntentV2Thunk = createAsyncThunk(
  'ridePageV2/createPaymentIntent',
  (rideId, { rejectWithValue }) => {
    return apiV2(`/api/v2/payments/rides/${rideId}/intent`, { method: 'POST' }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

/**
 * Confirms the card payment with Stripe directly - unlike the Sharetribe version, there is no
 * follow-up "tell the backend the payment is confirmed" transition to call: the webhook
 * (server/api/v2/payments/webhook.js) is what flips paymentStatus to 'paid', verified against
 * Stripe's own signature, exactly like every other Phase 6 payment. This thunk just re-polls once
 * afterward so the UI reflects real state rather than assuming the webhook already landed.
 */
export const confirmRidePaymentV2Thunk = createAsyncThunk(
  'ridePageV2/confirmPayment',
  ({ rideId, stripe, paymentParams, stripePaymentIntentClientSecret }, { dispatch, rejectWithValue }) => {
    return dispatch(
      confirmCardPayment({ orderId: rideId, stripe, paymentParams, stripePaymentIntentClientSecret })
    )
      .then(() => dispatch(pollRideStatusV2Thunk(rideId)))
      .catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

// ================ Slice ================ //

const initialState = {
  pickup: null, // { lat, lng, address }
  destination: null, // { lat, lng, address }
  routeEstimate: null, // { distanceInMeters, durationInSeconds, routePolyline } - live estimate only, see RidePageV2.js
  fareEstimate: null, // calculateRideFare() result - informational; the real fare is always server-computed

  requestInProgress: false,
  requestError: null,

  rideId: null,
  ride: null,
  driverLocation: null, // { lat, lng, updatedAt } | null - see server/api/v2/rides/getOne.js
  uiState: uiStates.IDLE,

  cancelInProgress: false,
  cancelError: null,

  createIntentInProgress: false,
  createIntentError: null,
  paymentClientSecret: null,

  confirmInProgress: false,
  confirmError: null,
};

const ridePageV2Slice = createSlice({
  name: 'ridePageV2',
  initialState,
  reducers: {
    setPickupV2: (state, action) => {
      state.pickup = action.payload;
    },
    setDestinationV2: (state, action) => {
      state.destination = action.payload;
    },
    setRouteAndFareV2: (state, action) => {
      state.routeEstimate = action.payload.routeEstimate;
      state.fareEstimate = action.payload.fareEstimate;
    },
    // Fully clears everything - used when the rider abandons this ride request (e.g. changes
    // destination), or after a completed+paid ride, to start fresh.
    clearRideRequestV2: state => {
      Object.assign(state, initialState);
    },
  },
  extraReducers: builder => {
    builder
      .addCase(requestRideV2Thunk.pending, state => {
        state.requestInProgress = true;
        state.requestError = null;
      })
      .addCase(requestRideV2Thunk.fulfilled, (state, action) => {
        state.requestInProgress = false;
        const { ride } = action.payload;
        state.rideId = ride._id;
        state.ride = ride;
        state.uiState = ride.status; // real status IS the ui state for v2 - see rideProcessV2.js
      })
      .addCase(requestRideV2Thunk.rejected, (state, action) => {
        state.requestInProgress = false;
        state.requestError = action.payload;
      })
      .addCase(pollRideStatusV2Thunk.fulfilled, (state, action) => {
        const { ride, driverLocation } = action.payload;
        state.ride = ride;
        state.driverLocation = driverLocation || null;
        // Don't let a poll that raced with the payment step regress the UI backward - once we've
        // moved on to showing the payment form/result locally, the ride's own status
        // (trip_completed) never changes again, so there's nothing to "regress" to; this guard
        // just makes that explicit rather than relying on it being a coincidence.
        if (state.uiState !== uiStates.PAYING && state.uiState !== uiStates.PAID) {
          state.uiState = ride.status;
        }
      })
      .addCase(cancelRideV2Thunk.pending, state => {
        state.cancelInProgress = true;
        state.cancelError = null;
      })
      .addCase(cancelRideV2Thunk.fulfilled, (state, action) => {
        state.cancelInProgress = false;
        state.ride = action.payload.ride;
        state.uiState = action.payload.ride.status;
      })
      .addCase(cancelRideV2Thunk.rejected, (state, action) => {
        state.cancelInProgress = false;
        state.cancelError = action.payload;
      })
      .addCase(createRidePaymentIntentV2Thunk.pending, state => {
        state.createIntentInProgress = true;
        state.createIntentError = null;
        state.uiState = uiStates.PAYING;
      })
      .addCase(createRidePaymentIntentV2Thunk.fulfilled, (state, action) => {
        state.createIntentInProgress = false;
        state.paymentClientSecret = action.payload.clientSecret;
      })
      .addCase(createRidePaymentIntentV2Thunk.rejected, (state, action) => {
        state.createIntentInProgress = false;
        state.createIntentError = action.payload;
        state.uiState = rideStatuses.TRIP_COMPLETED; // back off PAYING so the "pay now" button reappears
      })
      .addCase(confirmRidePaymentV2Thunk.pending, state => {
        state.confirmInProgress = true;
        state.confirmError = null;
      })
      .addCase(confirmRidePaymentV2Thunk.fulfilled, state => {
        state.confirmInProgress = false;
        state.uiState = uiStates.PAID;
      })
      .addCase(confirmRidePaymentV2Thunk.rejected, (state, action) => {
        state.confirmInProgress = false;
        state.confirmError = action.payload;
      });
  },
});

export const { setPickupV2, setDestinationV2, setRouteAndFareV2, clearRideRequestV2 } = ridePageV2Slice.actions;

export default ridePageV2Slice.reducer;
