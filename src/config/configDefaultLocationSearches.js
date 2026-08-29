import { types as sdkTypes } from '../util/sdkLoader';

const { LatLng, LatLngBounds } = sdkTypes;

// An array of locations to show in the LocationAutocompleteInput when
// the input is in focus but the user hasn't typed in any search yet.
//
// Each item in the array should be an object with a unique `id` (String) and a
// `predictionPlace` (util.types.place) properties.
//
// NOTE: these are highly recommended, since they
//       1) help customers to find relevant locations, and
//       2) reduce the cost of using map providers geocoding API
// SERVIO's initial launch market: western Kentucky and southern Indiana.
// These are only *suggested* defaults shown before the user types anything - they do NOT restrict
// search. Mapbox geocoding (via REACT_APP_MAPBOX_ACCESS_TOKEN) still resolves any address, anywhere,
// so the marketplace can expand to new cities/states without any code change - just add another
// entry here (optional) and, more importantly, list providers who serve that area.
//
// Bounds are approximate city/metro bounding boxes: NE corner first, then SW corner.
const defaultLocations = [
  {
    id: 'default-owensboro-ky',
    predictionPlace: {
      address: 'Owensboro, KY, USA',
      bounds: new LatLngBounds(new LatLng(37.855, -86.98), new LatLng(37.695, -87.25)),
    },
  },
  {
    id: 'default-evansville-in',
    predictionPlace: {
      address: 'Evansville, IN, USA',
      bounds: new LatLngBounds(new LatLng(38.08, -87.42), new LatLng(37.86, -87.72)),
    },
  },
  {
    id: 'default-henderson-ky',
    predictionPlace: {
      address: 'Henderson, KY, USA',
      bounds: new LatLngBounds(new LatLng(37.91, -87.48), new LatLng(37.76, -87.70)),
    },
  },
  {
    id: 'default-madisonville-ky',
    predictionPlace: {
      address: 'Madisonville, KY, USA',
      bounds: new LatLngBounds(new LatLng(37.40, -87.40), new LatLng(37.26, -87.60)),
    },
  },
  {
    id: 'default-newburgh-in',
    predictionPlace: {
      address: 'Newburgh, IN, USA',
      bounds: new LatLngBounds(new LatLng(38.00, -87.35), new LatLng(37.90, -87.47)),
    },
  },
  {
    id: 'default-louisville-ky',
    predictionPlace: {
      address: 'Louisville, KY, USA',
      bounds: new LatLngBounds(new LatLng(38.38, -85.50), new LatLng(38.13, -85.95)),
    },
  },
];
export default defaultLocations;
