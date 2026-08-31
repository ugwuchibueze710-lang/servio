/**
 * src/containers/DriverRidePage/DriverRidePageV2.js
 *
 * The new-backend equivalent of DriverRidePage.js. Reuses the real GPS odometer hook from
 * DriverRidePage.js verbatim (pure geolocation math, no Sharetribe dependency) - only the data
 * source (DriverRidePageV2.duck.js instead of DriverRidePage.duck.js) and the shapes it reads
 * (plain Driver/RideRequest documents instead of Sharetribe listings/transactions) differ.
 *
 * Lives at the separate '/drive-v2' route - DriverRidePage.js at '/drive' keeps working exactly
 * as it does today. See RidePageV2.js's header for the same rationale.
 *
 * KNOWN GAP, disclosed rather than papered over: there is no driver-onboarding FORM here (vehicle
 * make/model/plate, license info) - Phase 5 built and tested POST /api/v2/drivers/me but no
 * frontend screen for it yet. A driver with no Driver record just sees a real message saying so,
 * not a fake/empty form pretending to work.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { rideStatuses, DRIVER_NEXT_STATUS } from '../../ride/rideProcessV2';
import { hasAppUserToken } from '../../util/apiV2';
import {
  fetchOwnDriverV2Thunk,
  setOnlineStatusV2Thunk,
  updateLocationV2Thunk,
  fetchIncomingCandidatesV2Thunk,
  fetchActiveRideV2Thunk,
  respondToRideV2Thunk,
  advanceRideStatusV2Thunk,
} from './DriverRidePageV2.duck';

// Reuses DriverRidePage's own stylesheet - purely visual, see RidePageV2.js for the same choice.
import css from './DriverRidePage.module.css';

const IDLE_LOCATION_INTERVAL_MS = 15000;
const TRIP_LOCATION_INTERVAL_MS = 6000;
const REQUEST_POLL_INTERVAL_MS = 4000;

const haversineMeters = (a, b) => {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Verbatim port of DriverRidePage.js's useTripOdometer - pure GPS math, nothing backend-specific. */
const useTripOdometer = isTripActive => {
  const [distanceMeters, setDistanceMeters] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const lastPointRef = useRef(null);
  const watchIdRef = useRef(null);

  useEffect(() => {
    if (!isTripActive || typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }
    setStartedAt(Date.now());
    lastPointRef.current = null;
    setDistanceMeters(0);

    watchIdRef.current = navigator.geolocation.watchPosition(
      position => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (lastPointRef.current) {
          setDistanceMeters(prev => prev + haversineMeters(lastPointRef.current, point));
        }
        lastPointRef.current = point;
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTripActive]);

  const durationSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
  return { distanceMeters, durationSeconds };
};

const NEXT_STATUS_LABEL = {
  [rideStatuses.DRIVER_ARRIVING]: "I'm on my way",
  [rideStatuses.DRIVER_ARRIVED]: "I've arrived",
  [rideStatuses.TRIP_STARTED]: 'Start trip',
  [rideStatuses.TRIP_COMPLETED]: 'End trip',
};

const DriverRidePageV2 = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const driverPage = useSelector(state => state.DriverRidePageV2);

  const activeRide = driverPage.activeRide;
  const isOnTrip = !!activeRide;
  const odometer = useTripOdometer(activeRide?.status === rideStatuses.TRIP_STARTED);

  // Sharetribe's auth:true route gate (state.auth.isAuthenticated) is gone from this route -
  // see routeConfiguration.js's comment on this route entry - since that state can never become
  // true anymore. Redirect on mount if there's no real v2 session, mirroring the pattern already
  // used by BookingRequestPageV2.js.
  useEffect(() => {
    if (!hasAppUserToken()) {
      history.push(`/auth-v2?returnTo=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [history]);

  useEffect(() => {
    dispatch(fetchOwnDriverV2Thunk());
    dispatch(fetchActiveRideV2Thunk());
  }, [dispatch]);

  // Poll for incoming candidates while online and free; poll the active ride whenever one exists.
  useEffect(() => {
    if (!driverPage.driver) return undefined;
    const timer = setInterval(() => {
      if (driverPage.isOnline && !isOnTrip) {
        dispatch(fetchIncomingCandidatesV2Thunk());
      }
      if (isOnTrip) {
        dispatch(fetchActiveRideV2Thunk());
      }
    }, REQUEST_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dispatch, driverPage.driver, driverPage.isOnline, isOnTrip]);

  // Throttled location reporting while online - tighter interval while on a trip.
  useEffect(() => {
    if (!driverPage.driver || !driverPage.isOnline || typeof navigator === 'undefined') {
      return undefined;
    }
    const intervalMs = isOnTrip ? TRIP_LOCATION_INTERVAL_MS : IDLE_LOCATION_INTERVAL_MS;
    const reportLocation = () => {
      navigator.geolocation.getCurrentPosition(
        position => {
          dispatch(
            updateLocationV2Thunk({ lat: position.coords.latitude, lng: position.coords.longitude })
          );
        },
        () => {
          // GPS disabled/denied while online - real failure mode; the driver's last-known
          // location simply goes stale, which the customer's polling will reflect.
        },
        { enableHighAccuracy: true, maximumAge: intervalMs / 2, timeout: 8000 }
      );
    };
    reportLocation();
    const timer = setInterval(reportLocation, intervalMs);
    return () => clearInterval(timer);
  }, [dispatch, driverPage.driver, driverPage.isOnline, isOnTrip]);

  const handleToggleOnline = () => {
    if (!driverPage.driver || isOnTrip) return; // can't go offline mid-trip
    navigator.geolocation.getCurrentPosition(position => {
      dispatch(
        setOnlineStatusV2Thunk({
          isOnline: !driverPage.isOnline,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      );
    });
  };

  const handleAdvance = () => {
    if (!activeRide) return;
    const nextStatus = DRIVER_NEXT_STATUS[activeRide.status];
    dispatch(
      advanceRideStatusV2Thunk({
        rideId: activeRide._id,
        fromStatus: activeRide.status,
        actualDistanceInMeters: nextStatus === rideStatuses.TRIP_COMPLETED ? Math.round(odometer.distanceMeters) : undefined,
        actualDurationInSeconds: nextStatus === rideStatuses.TRIP_COMPLETED ? odometer.durationSeconds : undefined,
      })
    );
  };

  if (!driverPage.driver) {
    return (
      <div className={css.root}>
        <p>
          You haven't set up driving on the new backend yet. There's no onboarding form on this page
          yet (Phase 5 built and tested the underlying <code>POST /api/v2/drivers/me</code> endpoint,
          but not a frontend screen for it) - see MIGRATION_PLAN.md.
        </p>
      </div>
    );
  }

  const incomingRequest = driverPage.incomingCandidates[0] || null;
  const nextStatus = activeRide ? DRIVER_NEXT_STATUS[activeRide.status] : null;

  return (
    <div className={css.root}>
      <div className={css.header}>
        <span className={css.statusLabel}>{driverPage.isOnline ? 'Online' : 'Offline'}</span>
        <button
          className={driverPage.isOnline ? css.onlineToggleActive : css.onlineToggle}
          onClick={handleToggleOnline}
          disabled={driverPage.toggleOnlineInProgress || isOnTrip}
        >
          {driverPage.isOnline ? 'Go offline' : 'Go online'}
        </button>
      </div>

      {incomingRequest && !isOnTrip && (
        <div className={css.requestCard}>
          <p className={css.requestTitle}>New ride request</p>
          {driverPage.incomingCandidates.length > 1 && (
            <p>+{driverPage.incomingCandidates.length - 1} more waiting</p>
          )}
          <div className={css.requestActions}>
            <button
              className={css.primaryButton}
              onClick={() => dispatch(respondToRideV2Thunk({ rideId: incomingRequest._id, action: 'accept' }))}
              disabled={driverPage.respondInProgress}
            >
              Accept
            </button>
            <button
              className={css.secondaryButton}
              onClick={() => dispatch(respondToRideV2Thunk({ rideId: incomingRequest._id, action: 'decline' }))}
              disabled={driverPage.respondInProgress}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {activeRide && (
        <div className={css.tripCard}>
          <p className={css.requestTitle}>Active trip</p>
          {activeRide.status === rideStatuses.TRIP_STARTED && (
            <p>
              {(odometer.distanceMeters / 1609.344).toFixed(1)} mi · {Math.round(odometer.durationSeconds / 60)} min so far
            </p>
          )}
          {nextStatus && (
            <button
              className={css.primaryButton}
              onClick={handleAdvance}
              disabled={driverPage.advanceInProgress}
            >
              {NEXT_STATUS_LABEL[nextStatus]}
            </button>
          )}
          {driverPage.advanceError && <p>Something went wrong. Please try again.</p>}
        </div>
      )}
    </div>
  );
};

export default DriverRidePageV2;
