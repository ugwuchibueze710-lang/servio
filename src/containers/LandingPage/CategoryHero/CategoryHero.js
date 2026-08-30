import React, { useCallback, useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';

import { useConfiguration } from '../../../context/configurationContext';
import { useRouteConfiguration } from '../../../context/routeConfigurationContext';
import { createResourceLocatorString } from '../../../util/routes';
import { isOriginInUse } from '../../../util/search';
import { useIntl } from '../../../util/reactIntl';

import {
  IconCheckmark,
  IconLocation,
  IconSearch,
  LocationAutocompleteInput,
} from '../../../components';

import serviceCategories from '../../../config/configServiceCategories';

import iconRide from '../../../assets/categoryIcons/ride.jpg';
import iconHomeImprovement from '../../../assets/categoryIcons/home-improvement.jpg';
import iconCleaning from '../../../assets/categoryIcons/cleaning.jpg';
import iconLandscaping from '../../../assets/categoryIcons/landscaping.jpg';
import iconPlumbing from '../../../assets/categoryIcons/plumbing.jpg';
import iconElectrical from '../../../assets/categoryIcons/electrical.jpg';
import iconHvac from '../../../assets/categoryIcons/hvac.jpg';
import iconMoving from '../../../assets/categoryIcons/moving.jpg';
import iconAutoServices from '../../../assets/categoryIcons/auto-services.jpg';
import iconPhotography from '../../../assets/categoryIcons/photography.jpg';
import iconEvents from '../../../assets/categoryIcons/events.jpg';
import iconBeauty from '../../../assets/categoryIcons/beauty.jpg';
import iconPetServices from '../../../assets/categoryIcons/pet-services.jpg';
import iconTechnology from '../../../assets/categoryIcons/technology.jpg';
import iconTutoring from '../../../assets/categoryIcons/tutoring.jpg';
import iconPersonalServices from '../../../assets/categoryIcons/personal-services.jpg';
import iconBusinessServices from '../../../assets/categoryIcons/business-services.jpg';
import iconHandyman from '../../../assets/categoryIcons/handyman.jpg';
import iconLawnCare from '../../../assets/categoryIcons/lawn-care.jpg';
import iconPressureWashing from '../../../assets/categoryIcons/pressure-washing.jpg';
import iconPainting from '../../../assets/categoryIcons/painting.jpg';

import css from './CategoryHero.module.css';

const ICONS_BY_ID = {
  ride: iconRide,
  'home-improvement': iconHomeImprovement,
  cleaning: iconCleaning,
  landscaping: iconLandscaping,
  plumbing: iconPlumbing,
  electrical: iconElectrical,
  hvac: iconHvac,
  moving: iconMoving,
  'auto-services': iconAutoServices,
  photography: iconPhotography,
  events: iconEvents,
  beauty: iconBeauty,
  'pet-services': iconPetServices,
  technology: iconTechnology,
  tutoring: iconTutoring,
  'personal-services': iconPersonalServices,
  'business-services': iconBusinessServices,
  handyman: iconHandyman,
  'lawn-care': iconLawnCare,
  'pressure-washing': iconPressureWashing,
  painting: iconPainting,
};

// The chosen location is remembered across visits (and across clicking into a category and
// coming back) so a customer only has to set it once. It's just a local-storage convenience,
// not sensitive data - if it's unavailable (private browsing, etc.) we just fall back to no
// stored location and everything still works, it just won't be pre-filled.
const LOCATION_STORAGE_KEY = 'servio.selectedLocation';

const loadStoredLocation = () => {
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const saveStoredLocation = value => {
  try {
    if (value?.selectedPlace) {
      window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(LOCATION_STORAGE_KEY);
    }
  } catch (e) {
    // ignore - localStorage may be unavailable
  }
};

// Small pin icon shown inside the location input itself (in place of the default search-glass
// icon) so the box reads as "set a location" rather than "search". Rendered with no props by
// LocationAutocompleteInput, so it just needs to exist as its own component.
const LocationPinIcon = () => <IconLocation className={css.locationInputIcon} />;

/**
 * Categories are fetched from the new database-backed endpoint (server/api/v2/categories.js -
 * see MIGRATION_PLAN.md Phase 1) so the category system is admin-editable data, not a hardcoded
 * list. If that endpoint isn't reachable yet (MONGODB_URI not configured, request fails, etc.)
 * this falls back to the bundled static list/icons below, so the homepage never breaks.
 */
const normalizeApiCategory = apiCategory => ({
  id: apiCategory.slug,
  name: apiCategory.name,
  shortName: apiCategory.name.toLowerCase(),
  blurb: apiCategory.blurb,
  imageUrl: apiCategory.imageUrl,
  isRideCategory: !!apiCategory.isRideCategory,
});

/**
 * CategoryHero
 *
 * The homepage's main above-the-fold content: every service category is shown as a clickable
 * tile (the "star of the show"), with a small location bar up top just to set/change the area,
 * and a text box to search/filter the category tiles themselves.
 *
 * The location bar does NOT search by itself - picking a place just remembers it (in state and
 * localStorage) and visually "locks in" as a pill with the chosen address, a checkmark, and a
 * Change/clear control, so it's obvious the location has been set. Clicking a category tile is
 * what actually searches, and it carries the currently remembered location along with it (as
 * real map bounds - see goToCategory below), so "pick a location, then tap a category" only
 * shows listings from that area. If nobody has listed that category in that area yet, the
 * results page's own empty state ("No listings found") covers that automatically.
 *
 * Clicking "Ride" jumps straight into the live ride-matching flow (RidePage) instead of a
 * generic filtered search, since Ride isn't a browsable listing category - it's a real-time
 * dispatch feature with its own destination picker.
 *
 * @component
 */
const CategoryHero = () => {
  const history = useHistory();
  const routeConfiguration = useRouteConfiguration();
  const config = useConfiguration();
  const intl = useIntl();

  const [query, setQuery] = useState('');
  const [location, setLocation] = useState({ search: '', selectedPlace: null });
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [categories, setCategories] = useState(serviceCategories);

  // Load any previously chosen location once, on mount.
  useEffect(() => {
    const stored = loadStoredLocation();
    if (stored) {
      setLocation(stored);
    }
  }, []);

  // Fetch the live, database-driven category list once, on mount. Falls back to (and starts out
  // as) the bundled static list, so nothing on screen ever depends on this succeeding.
  useEffect(() => {
    let isMounted = true;
    fetch('/api/v2/categories')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`status ${res.status}`))))
      .then(body => {
        const apiCategories = Array.isArray(body?.data) ? body.data : [];
        if (isMounted && apiCategories.length > 0) {
          setCategories(apiCategories.map(normalizeApiCategory));
        }
      })
      .catch(() => {
        // Database not configured yet, or request failed - keep the static fallback list that's
        // already in state. Intentionally silent; this is expected during early rollout.
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLocationChange = value => {
    setLocation(value);
    if (value?.selectedPlace) {
      // A real place was picked from the predictions dropdown (not just typing) - lock it in.
      saveStoredLocation(value);
      setIsEditingLocation(false);
    }
  };

  const handleChangeLocationClick = () => {
    setIsEditingLocation(true);
  };

  const handleClearLocation = () => {
    setLocation({ search: '', selectedPlace: null });
    saveStoredLocation(null);
    setIsEditingLocation(false);
  };

  // Locked = a real place is selected and the user isn't actively editing it right now.
  const isLocationLocked = !!location?.selectedPlace && !isEditingLocation;

  const normalizedQuery = query.trim().toLowerCase();
  const visibleCategories = normalizedQuery
    ? categories.filter(
        c =>
          c.name.toLowerCase().includes(normalizedQuery) ||
          c.shortName.toLowerCase().includes(normalizedQuery)
      )
    : categories;

  const getCategoryImage = useCallback(
    category => category.imageUrl || ICONS_BY_ID[category.id],
    []
  );

  const goToCategory = category => {
    if (category.id === 'ride' || category.isRideCategory) {
      history.push(createResourceLocatorString('RidePage', routeConfiguration, {}, {}));
      return;
    }

    const searchParams = { pub_categoryLevel1: category.id };

    if (location?.selectedPlace) {
      const {
        search,
        selectedPlace: { origin, bounds },
      } = location;
      searchParams.bounds = bounds;
      searchParams.address = search;
      if (isOriginInUse(config) && origin) {
        searchParams.origin = `${origin.lat},${origin.lng}`;
      }
    }

    history.push(createResourceLocatorString('SearchPage', routeConfiguration, {}, searchParams));
  };

  return (
    <div className={css.root}>
      <div className={css.locationBar}>
        {isLocationLocked ? (
          <div className={css.locationLocked}>
            <IconCheckmark size="small" className={css.locationLockedIcon} />
            <span className={css.locationLockedText} title={location.search}>
              {location.search}
            </span>
            <button
              type="button"
              className={css.locationChangeButton}
              onClick={handleChangeLocationClick}
            >
              Change
            </button>
            <button
              type="button"
              className={css.locationClearButton}
              onClick={handleClearLocation}
              aria-label="Clear location"
              title="Clear location"
            >
              &times;
            </button>
          </div>
        ) : (
          <LocationAutocompleteInput
            className={css.locationInput}
            iconClassName={css.locationInputIconBox}
            inputClassName={css.locationInputField}
            predictionsClassName={css.locationPredictions}
            CustomIcon={LocationPinIcon}
            useDarkText={true}
            autoFocus={isEditingLocation}
            placeholder={intl.formatMessage({ id: 'PageBuilder.SearchCTA.locationPlaceholder' })}
            closeOnBlur={true}
            input={{
              name: 'category-hero-location',
              value: location,
              onChange: handleLocationChange,
              onBlur: () => {},
              onFocus: () => {},
            }}
            meta={{}}
          />
        )}
      </div>

      <h1 className={css.title}>What service do you need?</h1>
      <p className={css.subtitle}>
        {isLocationLocked ? (
          <>
            Showing categories near <strong>{location.search}</strong> - tap one to see
            who&apos;s available.
          </>
        ) : (
          <>
            Every category below is live and searchable. Set your location above, then tap a
            category to see who&apos;s available near you - if nobody has signed up yet in your
            area, you&apos;ll see that too.
          </>
        )}
      </p>

      <div className={css.categorySearch}>
        <IconSearch className={css.categorySearchIcon} />
        <input
          type="text"
          className={css.categorySearchInput}
          placeholder="Search for another type of service..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className={css.grid}>
        {visibleCategories.map(category => (
          <button
            key={category.id}
            type="button"
            className={css.tile}
            onClick={() => goToCategory(category)}
          >
            <img
              className={css.tileImage}
              src={getCategoryImage(category)}
              alt={category.name}
            />
            <span className={css.tileLabel}>{category.name}</span>
          </button>
        ))}
        {visibleCategories.length === 0 ? (
          <p className={css.noMatches}>
            No category matches &quot;{query}&quot; yet - try a different search term.
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default CategoryHero;
