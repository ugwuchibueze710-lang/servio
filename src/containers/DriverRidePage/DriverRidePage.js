import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { transitions } from '../../ride/rideProcess';
import {
  fetchOwnDriverListingThunk,
  setOnlineStatusThunk,
  updateIdleLocationThunk,
  fetchIncomingRequestThunk,
  fetchActiveTripThunk,
  acceptRideThunk,
  declineRideThunk,
  markEnRouteThunk,
  markArrivedThunk,
  startTripThunk,
  completeTripThunk,
} from './DriverRidePage.duck';

import css from './DriverRidePage.module.css';

const IDLE_LOCATION_INTERVAL_MS = 15000; // throttled, battery/network-aware per spec section 10
const TRIP_LOCATION_INTERVAL_MS = 6000; // tighter while actively on a trip
const REQUEST_POLL_INTERVAL_MS = 4000;
const DRIVER_ACCEPTANCE_WINDOW_SECONDS = 25; // must match process.edn's ride-driver-timeout period

const haversineMeters = (a, b) => {
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * Real GPS odometer for the current trip: accumulates actual distance
 * travelled from consecutive real geolocation samples, and elapsed real
 * time since trip start. This is what COMPLETE_TRIP sends as the
 * "actual" distance/duration for final fare recalculation - never the
 * original pre-trip estimate (spec section 22).
 */
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
      // Stale/denied GPS during a trip is a real failure mode (spec
      // section 10/23) - surfaced by distanceMeters simply not advancing
      // rather than a crash or a fabricated number.
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

const DriverRidePage = () => {
  const dispatch = useDispatch();
  const driverPage = useSelector(state => state.DriverRidePage);
  const [acceptanceSecondsLeft, setAcceptanceSecondsLeft] = useState(null);

  const isOnTrip = !!driverPage.activeTrip;
  const odometer = useTripOdometer(
    driverPage.activeTrip?.attributes?.lastTransition === transitions.START_TRIP
  );

  useEffect(() => {
    dispatch(fetchOwnDriverListingThunk());
  }, [dispatch]);

  // Poll for incoming requests while online and free; poll active-trip
  // status whenever one exists (spec section 7).
  useEffect(() => {
    if (!driverPage.ownListing) return undefined;
    const timer = setInterval(() => {
      if (driverPage.isOnline && !isOnTrip) {
        dispatch(fetchIncomingRequestThunk());
      }
      if (isOnTrip) {
        dispatch(fetchActiveTripThunk());
      }
    }, REQUEST_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dispatch, driverPage.ownListing, driverPage.isOnline, isOnTrip]);

  // Visual-only acceptance countdown - the real timeout is enforced
  // server-side by process.edn's ride-driver-timeout `:at` transition;
  // this just keeps the driver's UI honest about how long is left rather
  // than leaving it open-ended.
  useEffect(() => {
    if (!driverPage.incomingRequest) {
      setAcceptanceSecondsLeft(null);
      return undefined;
    }
    setAcceptanceSecondsLeft(DRIVER_ACCEPTANCE_WINDOW_SECONDS);
    const timer = setInterval(() => {
      setAcceptanceSecondsLeft(prev => (prev != null ? Math.max(0, prev - 1) : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [driverPage.incomingRequest]);

  // Throttled location reporting while online (idle) or on a trip (tighter
  // interval) - see rideDirections.js's module comment for why this is
  // interval-based rather than continuous streaming.
  useEffect(() => {
    if (!driverPage.ownListing || !driverPage.isOnline || typeof navigator === 'undefined') {
      return undefined;
    }
    const intervalMs = isOnTrip ? TRIP_LOCATION_INTERVAL_MS : IDLE_LOCATION_INTERVAL_MS;
    const reportLocation = () => {
      navigator.geolocation.getCurrentPosition(
        position => {
          dispatch(
            updateIdleLocationThunk({
              listingId: driverPage.ownListing.id,
              geolocation: { lat: position.coords.latitude, lng: position.coords.longitude },
            })
          );
        },
        () => {
          // GPS disabled/denied while online - real failure mode; the
          // listing's last-known geolocation simply goes stale, which
          // RidePage's polling will reflect rather than fabricate motion.
        },
        { enableHighAccuracy: true, maximumAge: intervalMs / 2, timeout: 8000 }
      );
    };
    reportLocation();
    const timer = setInterval(reportLocation, intervalMs);
    return () => clearInterval(timer);
  }, [dispatch, driverPage.ownListing, driverPage.isOnline, isOnTrip]);

  const handleToggleOnline = () => {
    if (!driverPage.ownListing) return;
    if (isOnTrip) return; // spec section 16: can't go offline mid-trip
    navigator.geolocation.getCurrentPosition(position => {
      dispatch(
        setOnlineStatusThunk({
          listingId: driverPage.ownListing.id,
          isOnline: !driverPage.isOnline,
          geolocation: { lat: position.coords.latitude, lng: position.coords.longitude },
        })
      );
    });
  };

  const handleCompleteTrip = () => {
    dispatch(
      completeTripThunk({
        transactionId: driverPage.activeTrip.id,
        actualDistanceInMeters: Math.round(odometer.distanceMeters),
        actualDurationInSeconds: odometer.durationSeconds,
      })
    );
  };

  if (!driverPage.ownListing) {
    return (
      <div className={css.root}>
        <p>
          You haven't set up driving yet. Add vehicle details to your Servio provider profile to start
          accepting rides - see the "Drive with Servio" option in your provider dashboard.
        </p>
      </div>
    );
  }

  const trip = driverPage.activeTrip;
  const tripState = trip?.attributes?.lastTransition;

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

      {driverPage.incomingRequest && !isOnTrip && (
        <div className={css.requestCard}>
          <p className={css.requestTitle}>New ride request</p>
          <p>{acceptanceSecondsLeft}s to respond</p>
          <div className={css.requestActions}>
            <button
              className={css.primaryButton}
              onClick={() => dispatch(acceptRideThunk(driverPage.incomingRequest.id))}
              disabled={driverPage.acceptInProgress}
            >
              Accept
            </button>
            <button
              className={css.secondaryButton}
              onClick={() => dispatch(declineRideThunk(driverPage.incomingRequest.id))}
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {trip && (
        <div className={css.tripCard}>
          <p className={css.requestTitle}>Active trip</p>
          {tripState === transitions.DRIVER_ACCEPT && (
            <button className={css.primaryButton} onClick={() => dispatch(markEnRouteThunk(trip.id))}>
              I'm on my way
            </button>
          )}
          {tripState === transitions.DRIVER_EN_ROUTE && (
            <button className={css.primaryButton} onClick={() => dispatch(markArrivedThunk(trip.id))}>
              I've arrived
            </button>
          )}
          {tripState === transitions.DRIVER_ARRIVED && (
            <button className={css.primaryButton} onClick={() => dispatch(startTripThunk(trip.id))}>
              Start trip
            </button>
          )}
          {tripState === transitions.START_TRIP && (
            <>
              <p>
                {(odometer.distanceMeters / 1609.344).toFixed(1)} mi Â· {Math.round(odometer.durationSeconds / 60)}{' '}
                min so far
              </p>
              <button
                className={css.primaryButton}
                onClick={handleCompleteTrip}
                disabled={driverPage.completeInProgress}
              >
                End trip
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DriverRidePage;
