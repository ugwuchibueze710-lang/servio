/**
 * src/containers/ProviderSearchPageV2/ProviderSearchPageV2.js
 *
 * Public results list for the new-backend provider search - see ProviderSearchPageV2.duck.js's
 * header for why this is a new, parallel route rather than replacing the live category search.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import { userLocation } from '../../util/maps';
import { searchProvidersV2Thunk } from './ProviderSearchPageV2.duck';

import css from './ProviderSearchPageV2.module.css';

// Receives `params` the same way ServiceCategoryPage.js does - see src/routing/Routes.js, which
// passes `params={match.params}` to every route component (react-router v5 convention this app
// uses throughout, rather than the useParams() hook).
const ProviderSearchPageV2 = props => {
  const { categorySlug } = props.params || {};
  const dispatch = useDispatch();
  const searchPage = useSelector(state => state.ProviderSearchPageV2);
  const [nearMe, setNearMe] = useState(null); // { lat, lng } | null - "search near me" is opt-in

  useEffect(() => {
    if (!categorySlug) return;
    dispatch(
      searchProvidersV2Thunk({
        categorySlug,
        lat: nearMe?.lat,
        lng: nearMe?.lng,
      })
    );
  }, [dispatch, categorySlug, nearMe]);

  const handleSearchNearMe = () => {
    userLocation()
      .then(latlng => setNearMe({ lat: latlng.lat, lng: latlng.lng }))
      .catch(() => {
        // Real failure mode (denied/unavailable geolocation) - results simply stay
        // category-wide/rating-sorted rather than fabricating a location.
      });
  };

  return (
    <div className={css.root}>
      <h1 className={css.title}>{searchPage.categoryName || categorySlug}</h1>

      {!nearMe && (
        <button className={css.nearMeButton} onClick={handleSearchNearMe}>
          Search near me
        </button>
      )}
      {searchPage.searchedNear && (
        <p className={css.searchedNear}>
          Showing results within {searchPage.searchedNear.radiusMiles} miles, nearest first.
        </p>
      )}

      {searchPage.searchInProgress && <p>Searching...</p>}

      {searchPage.notFound && (
        <p className={css.errorText}>There's no "{categorySlug}" category.</p>
      )}
      {searchPage.searchError && !searchPage.notFound && (
        <p className={css.errorText}>Something went wrong searching. Please try again.</p>
      )}

      {!searchPage.searchInProgress && !searchPage.searchError && searchPage.data.length === 0 && (
        <p>No providers found in this category yet{nearMe ? ' near you' : ''}.</p>
      )}

      <ul className={css.resultsList}>
        {searchPage.data.map(business => (
          <li key={business._id} className={css.resultCard}>
            <p className={css.resultName}>{business.name}</p>
            {business.ratingCount > 0 && (
              <p className={css.resultRating}>
                {business.ratingAvg.toFixed(1)} ★ ({business.ratingCount})
              </p>
            )}
            <p className={css.resultBio}>{business.bio}</p>
            {business.serviceAreaLabel && <p className={css.resultDetail}>{business.serviceAreaLabel}</p>}
            {typeof business.distanceMeters === 'number' && (
              <p className={css.resultDetail}>{(business.distanceMeters / 1609.344).toFixed(1)} mi away</p>
            )}
            <Link className={css.requestLink} to={`/book-v2/${business._id}`}>
              Request this provider
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProviderSearchPageV2;
