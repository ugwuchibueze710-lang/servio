/**
 * src/components/LocationControl/LocationControl.js
 *
 * The real customer location control from spec sections 6-8: a Mapbox-backed address search
 * that resolves to real coordinates (never raw text alone), a lock/unlock toggle whose visual
 * state makes it unambiguous whether the location is active, and a search-radius selector.
 *
 * This component is presentational/controlled - it calls `onChange` with the new location state
 * ({ label, lat, lng, radiusMiles, locked }) and leaves persistence (PATCH /api/v2/me/location)
 * to the page that uses it, so it can also be reused for the provider service-area picker
 * (spec section 10) with `lockable={false}`.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  isMapboxConfigured,
  mapboxForwardGeocode,
  getCurrentLocation,
} from '../../util/mapboxGeocoding';
import css from './LocationControl.module.css';

const RADIUS_OPTIONS = [5, 10, 15, 25, 50];
const DEBOUNCE_MS = 300;

const LocationControl = props => {
  const {
    value = {},
    onChange,
    lockable = true,
    showRadius = true,
    label = 'Location',
  } = props;

  const [query, setQuery] = useState(value.label || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const mapboxReady = isMapboxConfigured();

  useEffect(() => {
    setQuery(value.label || '');
  }, [value.label]);

  const locked = lockable && !!value.locked;

  const handleQueryChange = e => {
    const next = e.target.value;
    setQuery(next);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!mapboxReady) {
      setError('Location search is temporarily unavailable.');
      return;
    }
    if (next.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await mapboxForwardGeocode(next);
        setSuggestions(results);
        setOpen(true);
      } catch (err) {
        setError('Location search is temporarily unavailable.');
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  };

  const selectSuggestion = suggestion => {
    setQuery(suggestion.label);
    setOpen(false);
    setSuggestions([]);
    onChange({
      ...value,
      label: suggestion.label,
      lat: suggestion.lat,
      lng: suggestion.lng,
    });
  };

  const handleUseCurrentLocation = async () => {
    if (!mapboxReady) {
      setError('Location search is temporarily unavailable.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getCurrentLocation();
      if (result) {
        setQuery(result.label);
        onChange({ ...value, label: result.label, lat: result.lat, lng: result.lng });
      }
    } catch (err) {
      setError(
        err.message === 'geolocation_denied'
          ? 'Location permission was denied.'
          : 'Could not determine your current location.'
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleLock = () => {
    if (!lockable) return;
    if (!locked && (value.lat === undefined || value.lng === undefined)) {
      setError('Select a location before locking it.');
      return;
    }
    onChange({ ...value, locked: !locked });
  };

  const handleRadiusChange = e => {
    onChange({ ...value, radiusMiles: Number(e.target.value) });
  };

  return (
    <div className={css.root}>
      <div className={css.fieldRow}>
        <span className={css.fieldLabel}>{label}</span>
        <div className={css.inputWrapper}>
          <input
            className={css.input}
            type="text"
            value={query}
            disabled={locked}
            placeholder="Enter your address or city"
            onChange={handleQueryChange}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {lockable && (
            <button
              type="button"
              className={locked ? css.lockButtonLocked : css.lockButton}
              onClick={toggleLock}
              aria-pressed={locked}
              title={locked ? 'Unlock to change location' : 'Lock this location'}
            >
              {locked ? 'Locked' : 'Lock'}
            </button>
          )}
          {open && suggestions.length > 0 && (
            <ul className={css.suggestions}>
              {suggestions.map(s => (
                <li key={s.id} className={css.suggestion} onMouseDown={() => selectSuggestion(s)}>
                  {s.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        {!locked && (
          <button type="button" className={css.currentLocationButton} onClick={handleUseCurrentLocation}>
            Use current location
          </button>
        )}
      </div>

      {showRadius && (
        <div className={css.radiusRow}>
          <span className={css.fieldLabel}>Radius</span>
          <select className={css.radiusSelect} value={value.radiusMiles || 15} onChange={handleRadiusChange}>
            {RADIUS_OPTIONS.map(r => (
              <option key={r} value={r}>
                {r} miles
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? <span className={css.statusText}>Searching...</span> : null}
      {error ? <span className={css.errorText}>{error}</span> : null}
    </div>
  );
};

export default LocationControl;
