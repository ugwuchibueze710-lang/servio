import React, { Component } from 'react';
import classNames from 'classnames';
import MultiTouch from 'mapbox-gl-multitouch';

import { decodeRouteToGeoJSON } from '../../ride/rideDirections';

import css from './RideMap.module.css';

const ROUTE_SOURCE_ID = 'servio-ride-route';
const ROUTE_LAYER_ID = 'servio-ride-route-line';

const buildPinElement = (modifierClass, label) => {
  const el = document.createElement('div');
  el.className = classNames(css.pin, modifierClass);
  el.setAttribute('aria-label', label);
  el.innerHTML = `<span class="${css.pinDot}"></span>`;
  return el;
};

// A clean, modern top-down vehicle marker (own inline SVG - no third-party
// icon dependency, see RIDE_INTEGRATION_REPORT.md section 12 on avoiding
// unnecessary asset dependencies). Rotated via mapboxgl.Marker's own
// `rotationAlignment`/`setRotation`, not a manual CSS transform, so it
// stays correctly oriented as the map itself is panned/rotated.
const buildVehicleElement = () => {
  const el = document.createElement('div');
  el.className = css.vehicleMarker;
  el.innerHTML = `
    <svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
      <circle cx="17" cy="17" r="16" fill="#111827" opacity="0.08" />
      <g>
        <path d="M17 4 L24 15 L20 15 L20 26 L14 26 L14 15 L10 15 Z" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
      </g>
    </svg>
  `;
  return el;
};

/**
 * Purpose-built ride map: pickup/destination pins, a rotating live vehicle
 * marker, and a route line - built directly on the same `window.mapboxgl`
 * instance and access token as the rest of Servio's Mapbox integration
 * (see DynamicMapboxMap.js). This is a separate component from `Map.js`
 * rather than an extension of it because Map.js's contract (one obfuscated
 * "listing location" center) is a different, narrower problem than a
 * multi-marker route map - see RIDE_INTEGRATION_REPORT.md section 3/10.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className
 * @param {{lat:number,lng:number}?} props.pickup
 * @param {{lat:number,lng:number}?} props.destination
 * @param {{lat:number,lng:number,headingDegrees:number}?} props.driverLocation
 * @param {string?} props.routePolyline - encoded polyline, e.g. TX_PROTECTED_DATA.ROUTE_POLYLINE
 * @param {number} [props.zoom=13]
 */
class RideMap extends Component {
  constructor(props) {
    super(props);
    this.mapContainer = null;
    this.map = null;
    this.pickupMarker = null;
    this.destinationMarker = null;
    this.vehicleMarker = null;
    this.hasFitBounds = false;
  }

  componentDidMount() {
    if (typeof window === 'undefined' || !window.mapboxgl) {
      return;
    }
    const { pickup, driverLocation, zoom = 13 } = this.props;
    const initialCenter = pickup || driverLocation || { lat: 0, lng: 0 };

    this.map = new window.mapboxgl.Map({
      container: this.mapContainer,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [initialCenter.lng, initialCenter.lat],
      zoom,
    });
    this.map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
    this.map.addControl(new MultiTouch());

    this.map.on('load', () => {
      this.map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: this.currentRouteGeoJSON() || { type: 'FeatureCollection', features: [] },
      });
      this.map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.85 },
      });
      this.syncMarkers();
      this.maybeFitBounds();
    });
  }

  componentDidUpdate(prevProps) {
    if (!this.map) {
      return;
    }
    this.syncMarkers();

    const routeChanged = prevProps.routePolyline !== this.props.routePolyline;
    if (routeChanged && this.map.getSource(ROUTE_SOURCE_ID)) {
      this.map
        .getSource(ROUTE_SOURCE_ID)
        .setData(this.currentRouteGeoJSON() || { type: 'FeatureCollection', features: [] });
    }
    if (routeChanged) {
      this.hasFitBounds = false;
      this.maybeFitBounds();
    }
  }

  componentWillUnmount() {
    [this.pickupMarker, this.destinationMarker, this.vehicleMarker].forEach(marker => {
      if (marker) {
        marker.remove();
      }
    });
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  currentRouteGeoJSON() {
    const { routePolyline } = this.props;
    return routePolyline ? decodeRouteToGeoJSON(routePolyline) : null;
  }

  syncMarkers() {
    const { pickup, destination, driverLocation } = this.props;

    this.syncOneMarker('pickupMarker', pickup, () => buildPinElement(css.pickupPin, 'Pickup location'));
    this.syncOneMarker('destinationMarker', destination, () =>
      buildPinElement(css.destinationPin, 'Destination')
    );

    if (driverLocation) {
      if (!this.vehicleMarker) {
        this.vehicleMarker = new window.mapboxgl.Marker({
          element: buildVehicleElement(),
          rotationAlignment: 'map',
        })
          .setLngLat([driverLocation.lng, driverLocation.lat])
          .addTo(this.map);
      } else {
        // Smoothly move to the new polled position rather than snapping -
        // the CSS transition on .vehicleMarker (see RideMap.module.css)
        // does the actual smoothing.
        this.vehicleMarker.setLngLat([driverLocation.lng, driverLocation.lat]);
      }
      if (typeof driverLocation.headingDegrees === 'number') {
        this.vehicleMarker.setRotation(driverLocation.headingDegrees);
      }
    } else if (this.vehicleMarker) {
      this.vehicleMarker.remove();
      this.vehicleMarker = null;
    }
  }

  syncOneMarker(key, position, buildElement) {
    if (position) {
      if (!this[key]) {
        this[key] = new window.mapboxgl.Marker({ element: buildElement() })
          .setLngLat([position.lng, position.lat])
          .addTo(this.map);
      } else {
        this[key].setLngLat([position.lng, position.lat]);
      }
    } else if (this[key]) {
      this[key].remove();
      this[key] = null;
    }
  }

  maybeFitBounds() {
    const { pickup, destination } = this.props;
    if (!this.map || this.hasFitBounds || !pickup || !destination) {
      return;
    }
    const bounds = new window.mapboxgl.LngLatBounds();
    bounds.extend([pickup.lng, pickup.lat]);
    bounds.extend([destination.lng, destination.lat]);
    const routeGeoJSON = this.currentRouteGeoJSON();
    if (routeGeoJSON) {
      routeGeoJSON.geometry.coordinates.forEach(coord => bounds.extend(coord));
    }
    this.map.fitBounds(bounds, { padding: 64, maxZoom: 15, duration: 400 });
    this.hasFitBounds = true;
  }

  render() {
    const { className, mapClassName } = this.props;
    const isMapboxAvailable = typeof window !== 'undefined' && !!window.mapboxgl;
    if (!isMapboxAvailable) {
      // Honest empty state rather than a fake static map - matches how
      // Map.js already handles the "provider not configured/loaded" case.
      return <div className={classNames(css.root, className)} />;
    }
    return (
      <div className={classNames(css.root, className)}>
        <div className={classNames(css.mapRoot, mapClassName)} ref={el => (this.mapContainer = el)} />
      </div>
    );
  }
}

export default RideMap;
