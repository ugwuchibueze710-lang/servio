/**
 * src/containers/DriverRidePage/DriverRidePageV2.duck.js
 *
 * The new-backend equivalent of DriverRidePage.duck.js - calls /api/v2/drivers + /api/v2/rides
 * instead of the Sharetribe SDK (sdk.ownListings.*, sdk.transactions.*) and
 * server/api/ride-transition-privileged.js. See src/ride/rideProcessV2.js for the real behavior
 * differences from the live version this reflects (a driver can be a 'searching'-phase candidate
 * on more than one ride broadcast at once; there's no per-candidate accept/decline race visible to
 * the driver beyond "did I get it or not").
 *
 * Deliberately its own redux slice ('driverRidePageV2') - DriverRidePage.js (the live page) is
 * untouched by this file. See DriverRidePageV2.js and the new '/drive-v2' route.
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiV2, storableApiV2Error } from '../../util/apiV2';
import { DRIVER_NEXT_STATUS } from '../../ride/rideProcessV2';

// ================ Thunks ================ //

/** The current user's own Driver + Vehicle records - null/null if they haven't onboarded. */
export const fetchOwnDriverV2Thunk = createAsyncThunk(
  'driverRidePageV2/fetchOwnDriver',
  (_, { rejectWithValue }) => {
    return apiV2('/api/v2/drivers/me').catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

/** Real online/offline toggle - see server/api/v2/drivers/setStatus.js. */
export const setOnlineStatusV2Thunk = createAsyncThunk(
  'driverRidePageV2/setOnlineStatus',
  ({ isOnline, lat, lng }, { rejectWithValue }) => {
    return apiV2('/api/v2/drivers/me/status', { method: 'POST', body: { isOnline, lat, lng } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

/** Throttled location ping while online (idle or mid-trip) - see updateLocation.js's own header. */
export const updateLocationV2Thunk = createAsyncThunk(
  'driverRidePageV2/updateLocation',
  ({ lat, lng }, { rejectWithValue }) => {
    return apiV2('/api/v2/drivers/me/location', { method: 'PATCH', body: { lat, lng } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

/** Rides currently waiting on THIS driver to respond (broadcast candidates, not yet accepted by anyone). */
export const fetchIncomingCandidatesV2Thunk = createAsyncThunk(
  'driverRidePageV2/fetchIncomingCandidates',
  (_, { rejectWithValue }) => {
    return apiV2('/api/v2/rides/candidates/mine').catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

/** This driver's own currently-assigned, not-yet-finished ride, if any - see getActiveMine.js. */
export const fetchActiveRideV2Thunk = createAsyncThunk(
  'driverRidePageV2/fetchActiveRide',
  (_, { rejectWithValue }) => {
    return apiV2('/api/v2/rides/active/mine').catch(e => rejectWithValue(storableApiV2Error(e)));
  }
);

export const respondToRideV2Thunk = createAsyncThunk(
  'driverRidePageV2/respondToRide',
  ({ rideId, action }, { rejectWithValue }) => {
    return apiV2(`/api/v2/rides/${rideId}/driver-respond`, { method: 'POST', body: { action } }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

/**
 * Advances the active ride exactly one real step (see server/utils/rideStateMachine.js /
 * DRIVER_NEXT_STATUS) - never lets the caller pick an arbitrary target status. Completing a trip
 * requires the actual GPS-accumulated distance/duration (see DriverRidePageV2.js's odometer hook,
 * mirroring DriverRidePage.js's existing one) so the real final fare gets recomputed server-side.
 */
export const advanceRideStatusV2Thunk = createAsyncThunk(
  'driverRidePageV2/advanceStatus',
  ({ rideId, fromStatus, actualDistanceInMeters, actualDurationInSeconds }, { rejectWithValue }) => {
    const nextStatus = DRIVER_NEXT_STATUS[fromStatus];
    if (!nextStatus) {
      return rejectWithValue({ type: 'error', message: `No forward transition from '${fromStatus}'.` });
    }
    const body =
      nextStatus === 'trip_completed' ? { status: nextStatus, actualDistanceInMeters, actualDurationInSeconds } : { status: nextStatus };
    return apiV2(`/api/v2/rides/${rideId}/status`, { method: 'POST', body }).catch(e =>
      rejectWithValue(storableApiV2Error(e))
    );
  }
);

// ================ Slice ================ //

const initialState = {
  driver: null,
  vehicle: null,
  fetchOwnDriverInProgress: false,

  isOnline: false,
  toggleOnlineInProgress: false,
  toggleOnlineError: null,

  incomingCandidates: [], // rides awaiting this driver's response
  activeRide: null, // the one ride this driver is actually assigned to, if any

  respondInProgress: false,
  respondError: null,

  advanceInProgress: false,
  advanceError: null,
};

const driverRidePageV2Slice = createSlice({
  name: 'driverRidePageV2',
  initialState,
  reducers: {
    clearIncomingCandidatesV2: state => {
      state.incomingCandidates = [];
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchOwnDriverV2Thunk.pending, state => {
        state.fetchOwnDriverInProgress = true;
      })
      .addCase(fetchOwnDriverV2Thunk.fulfilled, (state, action) => {
        state.fetchOwnDriverInProgress = false;
        state.driver = action.payload.driver;
        state.vehicle = action.payload.vehicle;
        state.isOnline = !!action.payload.driver?.isOnline;
      })
      .addCase(setOnlineStatusV2Thunk.pending, state => {
        state.toggleOnlineInProgress = true;
        state.toggleOnlineError = null;
      })
      .addCase(setOnlineStatusV2Thunk.fulfilled, (state, action) => {
        state.toggleOnlineInProgress = false;
        state.driver = action.payload.driver;
        state.isOnline = !!action.payload.driver?.isOnline;
      })
      .addCase(setOnlineStatusV2Thunk.rejected, (state, action) => {
        state.toggleOnlineInProgress = false;
        state.toggleOnlineError = action.payload;
      })
      .addCase(updateLocationV2Thunk.fulfilled, (state, action) => {
        state.driver = action.payload.driver;
      })
      .addCase(fetchIncomingCandidatesV2Thunk.fulfilled, (state, action) => {
        // Never overwrite an already-known active ride's slot with stale "still searching"
        // candidates - once assigned, this driver stops being a meaningful candidate list target.
        state.incomingCandidates = state.activeRide ? [] : action.payload.data || [];
      })
      .addCase(fetchActiveRideV2Thunk.fulfilled, (state, action) => {
        state.activeRide = action.payload.ride;
        if (action.payload.ride) {
          state.incomingCandidates = [];
        }
      })
      .addCase(respondToRideV2Thunk.pending, state => {
        state.respondInProgress = true;
        state.respondError = null;
      })
      .addCase(respondToRideV2Thunk.fulfilled, (state, action) => {
        state.respondInProgress = false;
        const ride = action.payload.ride;
        state.incomingCandidates = state.incomingCandidates.filter(c => c._id !== ride._id);
        if (ride.status === 'driver_assigned') {
          state.activeRide = ride;
        }
      })
      .addCase(respondToRideV2Thunk.rejected, (state, action) => {
        state.respondInProgress = false;
        state.respondError = action.payload;
      })
      .addCase(advanceRideStatusV2Thunk.pending, state => {
        state.advanceInProgress = true;
        state.advanceError = null;
      })
      .addCase(advanceRideStatusV2Thunk.fulfilled, (state, action) => {
        state.advanceInProgress = false;
        const ride = action.payload.ride;
        if (ride.status === 'trip_completed') {
          // The customer takes it from here (paying); this driver's dashboard is done with it.
          state.activeRide = null;
        } else {
          state.activeRide = ride;
        }
      })
      .addCase(advanceRideStatusV2Thunk.rejected, (state, action) => {
        state.advanceInProgress = false;
        state.advanceError = action.payload;
      });
  },
});

export const { clearIncomingCandidatesV2 } = driverRidePageV2Slice.actions;
export default driverRidePageV2Slice.reducer;
