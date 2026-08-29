import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useConfiguration } from '../../context/configurationContext';

import { userLocation } from '../../util/maps';
import GeocoderMapbox from '../../components/LocationAutocompleteInput/GeocoderMapbox';
import RideMap from '../../components/Map/RideMap';
import StripePaymentForm from '../CheckoutPage/StripePaymentForm/StripePaymentForm';
import { getDrivingRoute } from '../../ride/rideDirections';
import { calculateRideFare, DEFAULT_RIDE_PRICING } from '../../config/configRidePricing';
import { states, RIDE_CANDIDATE_STATES } from '../../ride/rideProcess';
import { TX_PROTECTED_DATA } from '../../ride/rideDataSchema';
import {
  setPickup,
  setDestination,
  setRouteAndFare,
  retryWithNextDriver,
  requestRideThunk,
  confirmRidePaymentThunk,
  pollRideStatusThunk,
  cancelRideThunk,
  isActiveTripUiState,
  rideDriverLocationSelector,
} from './RidePage.duck';

import css from './RidePage.module.css';

// How often the rider polls for transaction updates (driver location,
// state changes). See RIDE_INTEGRATION_REPORT.md section 5 for why this is
// interval polling rather than a push subscription.
const POLL_INTERVAL_MS = 6000;
const DRIVER_ACCEPTANCE_RETRY_LIMIT = 3;

const RidePage = () => {
  const dispatch = useDispatch();
  const config = useConfiguration();
  const ridePage = useSelector(state => state.RidePage);
  const geocoder = useMemo(() => new GeocoderMapbox(), []);

  const [destinationQuery, setDestinationQuery] = useState('');
  const [predictions, setPredictions] = useState([]);
  const pollTimerRef = useRef(null);

  // 1. Detect current location as the default pickup (spec section 6, step 1).
  useEffect(() => {
    userLocation()
      .then(latlng => dispatch(setPickup({ lat: latlng.lat, lng: latlng.lng, address: 'Current location' })))
      .catch(() => {
        // Real failure mode, not silently ignored - section 10/23. The UI
        // below shows a manual pickup search whenever pickup is still null.
      });
  }, [dispatch]);

  // 2. Once pickup+destination are both known, fetch the real route and
  // compute a live fare estimate (spec section 6, steps 4-9).
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
          DEFAULT_RIDE_PRICING // live estimate only - the real charge is recomputed server-side, see configRidePricing.js
        );
        dispatch(setRouteAndFare({ routeEstimate: route, fareEstimate }));
      })
      .catch(() => {
        // No drivable route between these two points - real failure, shown via routeEstimate staying null.
      });
    return () => {
      cancelled = true;
    };
  }, [ridePage.pickup, ridePage.destination, dispatch]);

  // 3. Poll transaction status while a ride is in flight.
  useEffect(() => {
    if (!ridePage.transactionId || ridePage.uiState === states.INITIAL) {
      return undefined;
    }
    pollTimerRef.current = setInterval(() => {
      dispatch(pollRideStatusThunk(ridePage.transactionId));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(pollTimerRef.current);
  }, [ridePage.transactionId, ridePage.uiState, dispatch]);

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
      dispatch(setDestination({ lat: place.origin.lat, lng: place.origin.lng, address: place.address }));
      setDestinationQuery(place.address);
      setPredictions([]);
    });
  };

  const handleRequestRide = () => {
    dispatch(
      requestRideThunk({
        pickup: ridePage.pickup,
        destination: ridePage.destination,
        distanceInMeters: ridePage.routeEstimate.distanceInMeters,
        durationInSeconds: ridePage.routeEstimate.durationInSeconds,
        excludeListingIds: ridePage.excludeListingIds,
      })
    );
  };

  const handleRetryNextDriver = () => {
    // Real sequential-candidate retry loop - see the header comment in
    // src/ride/rideProcess.js for why this spans multiple transactions
    // instead of one transaction reassigning its provider. The declined/
    // timed-out driver's listing id is added to excludeListingIds so the
    // next requestRideThunk call skips them.
    const declinedListingId = ridePage.transaction?.relationships?.listing?.data?.id?.uuid;
    dispatch(retryWithNextDriver(declinedListingId));
    dispatch(
      requestRideThunk({
        pickup: ridePage.pickup,
        destination: ridePage.destination,
        distanceInMeters: ridePage.routeEstimate.distanceInMeters,
        durationInSeconds: ridePage.routeEstimate.durationInSeconds,
        excludeListingIds: [...ridePage.excludeListingIds, declinedListingId].filter(Boolean),
      })
    );
  };

  const handleCancel = () => {
    const transition =
      ridePage.uiState === states.AWAITING_DRIVER_ACCEPTANCE || ridePage.uiState === states.PENDING_PAYMENT
        ? 'transition/ride-cancel-by-rider-free'
        : ridePage.uiState === states.DRIVER_ASSIGNED
        ? 'transition/ride-cancel-by-rider-with-fee-from-assigned'
        : ridePage.uiState === states.DRIVER_EN_ROUTE_TO_PICKUP
        ? 'transition/ride-cancel-by-rider-with-fee-from-en-route'
        : 'transition/ride-cancel-by-rider-with-fee-from-arrived';
    dispatch(cancelRideThunk({ transactionId: ridePage.transactionId, transition }));
  };

  const driverLocation = rideDriverLocationSelector(ridePage.driverListing);
  const showCandidateSearchingUi = RIDE_CANDIDATE_STATES.includes(ridePage.uiState);
  const showPaymentForm = ridePage.uiState === states.PENDING_PAYMENT && ridePage.transaction;
  const showActiveTrip = isActiveTripUiState(ridePage.uiState) || ridePage.uiState === states.TRIP_IN_PROGRESS;

  return (
    <div className={css.root}>
      <div className={css.mapPane}>
        <RideMap
          pickup={ridePage.pickup}
          destination={ridePage.destination}
          driverLocation={driverLocation}
          routePolyline={ridePage.routeEstimate?.routePolyline}
        />
      </div>

      <div className={css.controlPane}>
        {ridePage.uiState === states.INITIAL && (
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
                  {(ridePage.routeEstimate.distanceInMeters / 1609.344).toFixed(1)} mi Â·{' '}
                  {Math.round(ridePage.routeEstimate.durationInSeconds / 60)} min
                </p>
                <button className={css.primaryButton} onClick={handleRequestRide} disabled={ridePage.requestInProgress}>
                  {ridePage.requestInProgress ? 'Requesting...' : 'Request Ride'}
                </button>
              </div>
            )}

            {ridePage.noDriverFound && (
              <p className={css.errorText}>
                No drivers are currently available near your pickup location. Please try again shortly.
              </p>
            )}
            {ridePage.requestError && !ridePage.noDriverFound && (
              <p className={css.errorText}>Something went wrong requesting your ride. Please try again.</p>
            )}
          </>
        )}

        {showCandidateSearchingUi && !showPaymentForm && (
          <div className={css.statusCard}>
            <p>Finding your best available driver...</p>
            <button className={css.secondaryButton} onClick={handleCancel} disabled={ridePage.cancelInProgress}>
              Cancel
            </button>
          </div>
        )}

        {showPaymentForm && (
          <div className={css.statusCard}>
            {/*
              Reusing Servio's existing Stripe payment component and
              confirmCardPayment flow (src/ducks/stripe.duck.js) rather than
              a new payment integration - spec section 13. The prop set
              below covers the required fields per StripePaymentForm's own
              documented API; verify against CheckoutPageWithPayment.js's
              usage once this runs against a deployed ride process (Phase 3)
              - a few optional display props (askShippingDetails,
              showPickUpLocation, listingLocation) are intentionally omitted
              since Ride has no shippable/pickup-location listing concept.
            */}
            <StripePaymentForm
              formId="RidePagePaymentForm"
              inProgress={ridePage.confirmInProgress}
              confirmCardPaymentError={ridePage.confirmError}
              onSubmit={values => {
                const { stripe, paymentParams, stripePaymentIntentClientSecret } = values;
                dispatch(
                  confirmRidePaymentThunk({
                    transactionId: ridePage.transactionId,
                    stripe,
                    paymentParams,
                    stripePaymentIntentClientSecret,
                  })
                );
              }}
            />
          </div>
        )}

        {ridePage.uiState === states.NO_DRIVER_RESPONSE && (
          <div className={css.statusCard}>
            <p>That driver didn't respond in time.</p>
            {ridePage.excludeListingIds.length < DRIVER_ACCEPTANCE_RETRY_LIMIT ? (
              <button className={css.primaryButton} onClick={handleRetryNextDriver}>
                Try the next available driver
              </button>
            ) : (
              <p className={css.errorText}>No driver accepted this ride. You have not been charged.</p>
            )}
          </div>
        )}

        {showActiveTrip && (
          <div className={css.statusCard}>
            <p className={css.tripStatusLabel}>
              {ridePage.uiState === states.DRIVER_ASSIGNED && 'Your driver is on the way'}
              {ridePage.uiState === states.DRIVER_EN_ROUTE_TO_PICKUP && 'Your driver is heading to pickup'}
              {ridePage.uiState === states.DRIVER_ARRIVED && 'Your driver has arrived'}
              {ridePage.uiState === states.TRIP_IN_PROGRESS && 'Trip in progress'}
            </p>
            {ridePage.transaction?.attributes?.protectedData?.[TX_PROTECTED_DATA.DESTINATION]?.address && (
              <p className={css.fareDetail}>
                To: {ridePage.transaction.attributes.protectedData[TX_PROTECTED_DATA.DESTINATION].address}
              </p>
            )}
            {ridePage.uiState !== states.TRIP_IN_PROGRESS && (
              <button className={css.secondaryButton} onClick={handleCancel} disabled={ridePage.cancelInProgress}>
                Cancel ride
              </button>
            )}
          </div>
        )}

        {ridePage.uiState === states.COMPLETED && (
          <div className={css.statusCard}>
            <p>Your ride is complete. Thanks for riding with Servio!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RidePage;
