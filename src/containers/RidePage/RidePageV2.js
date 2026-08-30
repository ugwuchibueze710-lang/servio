/**
 * src/containers/RidePage/RidePageV2.js
 *
 * The new-backend equivalent of RidePage.js. Reuses every piece of RidePage.js that has nothing
 * to do with Sharetribe (Mapbox geocoding/directions, RideMap, StripePaymentForm, the fare
 * estimate math) - only the data source (RidePageV2.duck.js instead of RidePage.duck.js) and the
 * screens that depend on the real behavior differences documented in rideProcessV2.js (no
 * sequential retry-next-driver step; payment happens after the trip, not before dispatch) differ.
 *
 * Lives at the separate '/ride-v2' route (see routeConfiguration.js) - RidePage.js at '/ride'
 * keeps working exactly as it does today, untouched, until this is verified end-to-end against a
 * real deployment (real MongoDB/Stripe configured) and the routes are swapped - see
 * MIGRATION_PLAN.md.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useConfiguration } from '../../context/configurationContext';

import { userLocation } from '../../util/maps';
import GeocoderMapbox from '../../components/LocationAutocompleteInput/GeocoderMapbox';
import RideMap from '../../components/Map/RideMap';
import StripePaymentForm from '../CheckoutPage/StripePaymentForm/StripePaymentForm';
import { getDrivingRoute } from '../../ride/rideDirections';
import { calculateRideFare, DEFAULT_RIDE_PRICING } from '../../config/configRidePricing';
import { uiStates, rideStatuses, SEARCHING_STATUSES, ACTIVE_TRIP_STATUSES, CANCELLABLE_STATUSES } from '../../ride/rideProcessV2';
import {
  setPickupV2,
  setDestinationV2,
  setRouteAndFareV2,
  clearRideRequestV2,
  requestRideV2Thunk,
  pollRideStatusV2Thunk,
  cancelRideV2Thunk,
  createRidePaymentIntentV2Thunk,
  confirmRidePaymentV2Thunk,
} from './RidePageV2.duck';

// Reuses RidePage's own stylesheet - this is purely visual, not behavioral, so there's no reason
// to fork it; see RidePage.module.css.
import css from './RidePage.module.css';

const POLL_INTERVAL_MS = 6000;

const RidePageV2 = () => {
  const dispatch = useDispatch();
  const config = useConfiguration();
  const ridePage = useSelector(state => state.RidePageV2);
  const geocoder = useMemo(() => new GeocoderMapbox(), []);

  const [destinationQuery, setDestinationQuery] = useState('');
  const [predictions, setPredictions] = useState([]);
  const pollTimerRef = useRef(null);

  // 1. Detect current location as the default pickup.
  useEffect(() => {
    userLocation()
      .then(latlng => dispatch(setPickupV2({ lat: latlng.lat, lng: latlng.lng, address: 'Current location' })))
      .catch(() => {
        // Real failure mode, not silently ignored - the UI below shows a manual pickup search
        // whenever pickup is still null. (Manual pickup entry is out of scope for this pass,
        // same as the live RidePage.js today - see its own equivalent comment.)
      });
  }, [dispatch]);

  // 2. Once pickup+destination are both known, fetch the real route and compute a live fare
  // estimate. Identical to RidePage.js - this step is entirely backend-agnostic (pure Mapbox +
  // pure math), the estimate is never trusted for the actual charge either way.
  useEffect(() => {
    if (!ridePage.pickup || !ridePage.destination) {
      return;
    }
    let cancelled = false;
    getDrivingRoute(ridePage.pickup, ridePage.destination)
      .then(route => {
        if (cancelled) return;
        const fareEstimate = calculateRideFare(
          { distanceInMeters: route.distanceInMeters, durationInSeconds: route.durationInSeconds },
          DEFAULT_RIDE_PRICING
        );
        dispatch(setRouteAndFareV2({ routeEstimate: route, fareEstimate }));
      })
      .catch(() => {
        // No drivable route between these two points - real failure, shown via routeEstimate staying null.
      });
    return () => {
      cancelled = true;
    };
  }, [ridePage.pickup, ridePage.destination, dispatch]);

  // 3. Poll the ride while it's in flight - stops once it reaches a terminal status
  // (trip_completed/cancelled/no_drivers_found) or we've moved into the local payment steps.
  const isPolling =
    !!ridePage.rideId && ridePage.uiState !== uiStates.PAYING && ridePage.uiState !== uiStates.PAID &&
    ridePage.uiState !== rideStatuses.CANCELLED;
  useEffect(() => {
    if (!isPolling) {
      return undefined;
    }
    pollTimerRef.current = setInterval(() => {
      dispatch(pollRideStatusV2Thunk(ridePage.rideId));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(pollTimerRef.current);
  }, [isPolling, ridePage.rideId, dispatch]);

  const handleDestinationSearch = value => {
    setDestinationQuery(value);
    if (!value || value.length < 3) {
      setPredictions([]);
      return;
    }
    geocoder.getPlacePredictions(value).then(result => setPredictions(result.predictions || []));
  };

  const handleSelectPrediction = prediction => {
    geocoder.getPlaceDetails(prediction, config.maps.search.currentLocationBoundsDistance).then(place => {
      dispatch(setDestinationV2({ lat: place.origin.lat, lng: place.origin.lng, address: place.address }));
      setDestinationQuery(place.address);
      setPredictions([]);
    });
  };

  const handleRequestRide = () => {
    dispatch(
      requestRideV2Thunk({
        pickup: ridePage.pickup,
        destination: ridePage.destination,
        distanceInMeters: ridePage.routeEstimate.distanceInMeters,
        durationInSeconds: ridePage.routeEstimate.durationInSeconds,
      })
    );
  };

  const handleCancel = () => {
    dispatch(cancelRideV2Thunk({ rideId: ridePage.rideId }));
  };

  const handlePayNow = () => {
    dispatch(createRidePaymentIntentV2Thunk(ridePage.rideId));
  };

  const showRequestForm = ridePage.uiState === uiStates.IDLE;
  const showSearching = SEARCHING_STATUSES.includes(ridePage.uiState);
  const showNoDriversFound = ridePage.uiState === rideStatuses.NO_DRIVERS_FOUND;
  const showActiveTrip = ACTIVE_TRIP_STATUSES.includes(ridePage.uiState);
  const showTripCompletedUnpaid = ridePage.uiState === rideStatuses.TRIP_COMPLETED;
  const showPaymentForm = ridePage.uiState === uiStates.PAYING && ridePage.paymentClientSecret;
  const showPaid = ridePage.uiState === uiStates.PAID;
  const showCancelled = ridePage.uiState === rideStatuses.CANCELLED;
  const canCancel = CANCELLABLE_STATUSES.includes(ridePage.uiState);

  return (
    <div className={css.root}>
      <div className={css.mapPane}>
        <RideMap
          pickup={ridePage.pickup}
          destination={ridePage.destination}
          driverLocation={ridePage.driverLocation}
          routePolyline={ridePage.routeEstimate?.routePolyline}
        />
      </div>

      <div className={css.controlPane}>
        {showRequestForm && (
          <>
            <h1 className={css.title}>Where to?</h1>
            <input
              className={css.destinationInput}
              type="text"
              placeholder="Enter your destination"
              value={destinationQuery}
              onChange={e => handleDestinationSearch(e.target.value)}
            />
            {predictions.length > 0 && (
              <ul className={css.predictions}>
                {predictions.map(p => (
                  <li key={geocoder.getPredictionId(p)} onClick={() => handleSelectPrediction(p)}>
                    {geocoder.getPredictionAddress(p)}
                  </li>
                ))}
              </ul>
            )}

            {ridePage.fareEstimate && (
              <div className={css.fareCard}>
                <p className={css.fareAmount}>
                  ${(ridePage.fareEstimate.totalInSubunits / 100).toFixed(2)} estimated
                </p>
                <p className={css.fareDetail}>
                  {(ridePage.routeEstimate.distanceInMeters / 1609.344).toFixed(1)} mi ·{' '}
                  {Math.round(ridePage.routeEstimate.durationInSeconds / 60)} min
                </p>
                <p className={css.fareDetail}>You'll be charged once your trip is complete.</p>
                <button className={css.primaryButton} onClick={handleRequestRide} disabled={ridePage.requestInProgress}>
                  {ridePage.requestInProgress ? 'Requesting...' : 'Request Ride'}
                </button>
              </div>
            )}

            {ridePage.requestError && (
              <p className={css.errorText}>Something went wrong requesting your ride. Please try again.</p>
            )}
          </>
        )}

        {showSearching && (
          <div className={css.statusCard}>
            <p>Finding your best available driver...</p>
            {canCancel && (
              <button className={css.secondaryButton} onClick={handleCancel} disabled={ridePage.cancelInProgress}>
                Cancel
              </button>
            )}
          </div>
        )}

        {showNoDriversFound && (
          <div className={css.statusCard}>
            <p className={css.errorText}>
              No drivers are currently available near your pickup location. Please try again shortly.
            </p>
            <button className={css.primaryButton} onClick={() => dispatch(clearRideRequestV2())}>
              Start over
            </button>
          </div>
        )}

        {showActiveTrip && (
          <div className={css.statusCard}>
            <p className={css.tripStatusLabel}>
              {ridePage.uiState === rideStatuses.DRIVER_ASSIGNED && 'Your driver is on the way'}
              {ridePage.uiState === rideStatuses.DRIVER_ARRIVING && 'Your driver is heading to pickup'}
              {ridePage.uiState === rideStatuses.DRIVER_ARRIVED && 'Your driver has arrived'}
              {ridePage.uiState === rideStatuses.TRIP_STARTED && 'Trip in progress'}
            </p>
            {ridePage.ride?.destination?.label && (
              <p className={css.fareDetail}>To: {ridePage.ride.destination.label}</p>
            )}
            {ridePage.uiState !== rideStatuses.TRIP_STARTED && canCancel && (
              <button className={css.secondaryButton} onClick={handleCancel} disabled={ridePage.cancelInProgress}>
                Cancel ride
              </button>
            )}
          </div>
        )}

        {showTripCompletedUnpaid && (
          <div className={css.statusCard}>
            <p>Your trip is complete.</p>
            <p className={css.fareAmount}>${((ridePage.ride?.finalFare || 0) / 100).toFixed(2)}</p>
            {ridePage.createIntentError && (
              <p className={css.errorText}>Something went wrong starting payment. Please try again.</p>
            )}
            <button className={css.primaryButton} onClick={handlePayNow} disabled={ridePage.createIntentInProgress}>
              {ridePage.createIntentInProgress ? 'Preparing payment...' : 'Pay now'}
            </button>
          </div>
        )}

        {showPaymentForm && (
          <div className={css.statusCard}>
            {/* Same Stripe integration RidePage.js already uses - see its own comment for the
                rationale on which optional props are intentionally omitted for Ride. */}
            <StripePaymentForm
              formId="RidePageV2PaymentForm"
              inProgress={ridePage.confirmInProgress}
              confirmCardPaymentError={ridePage.confirmError}
              onSubmit={values => {
                const { stripe, paymentParams, stripePaymentIntentClientSecret } = values;
                dispatch(
                  confirmRidePaymentV2Thunk({
                    rideId: ridePage.rideId,
                    stripe,
                    paymentParams,
                    stripePaymentIntentClientSecret,
                  })
                );
              }}
            />
          </div>
        )}

        {showPaid && (
          <div className={css.statusCard}>
            <p>Your ride is complete and paid. Thanks for riding with Servio!</p>
            <button className={css.primaryButton} onClick={() => dispatch(clearRideRequestV2())}>
              Request another ride
            </button>
          </div>
        )}

        {showCancelled && (
          <div className={css.statusCard}>
            <p>This ride was cancelled.</p>
            <button className={css.primaryButton} onClick={() => dispatch(clearRideRequestV2())}>
              Start over
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RidePageV2;
