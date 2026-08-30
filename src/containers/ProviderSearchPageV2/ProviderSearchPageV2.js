/**
 * src/containers/ProviderSearchPageV2/ProviderSearchPageV2.js
 *
 * The real customer search/results experience (spec sections 2, 3, 8, 9, 10, 43): a location
 * control (lock/unlock + radius), the Groq smart search box (supplementing, never replacing,
 * manual browsing), a manual category chip row fed from the real GET /api/v2/categories list,
 * a visible sort control driving the server's real ranking algorithm
 * (server/utils/providerSearch.js), and a real save/favorite heart per result
 * (POST/DELETE /api/v2/me/saved-providers/:businessId).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useHistory } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';

import LocationControl from '../../components/LocationControl/LocationControl';
import SmartSearchBox from '../../components/SmartSearchBox/SmartSearchBox';
import useCustomerLocation from '../../hooks/useCustomerLocation';
import { apiV2, apiV2Public, hasAppUserToken } from '../../util/apiV2';
import { applySmartSearchNavigation } from '../../util/smartSearchNavigation';
import { searchProvidersV2Thunk } from './ProviderSearchPageV2.duck';

import css from './ProviderSearchPageV2.module.css';

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'distance', label: 'Closest' },
  { value: 'reviews', label: 'Most reviews' },
];

const ProviderSearchPageV2 = props => {
  const { categorySlug } = props.params || {};
  const dispatch = useDispatch();
  const history = useHistory();
  const searchPage = useSelector(state => state.ProviderSearchPageV2);
  const [location, setLocation] = useCustomerLocation();
  const [sort, setSort] = useState('recommended');
  const [categories, setCategories] = useState([]);
  const [savedIds, setSavedIds] = useState([]);
  const [navMessage, setNavMessage] = useState(null);

  useEffect(() => {
    apiV2Public('/api/v2/categories')
      .then(data => setCategories(data.data || []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (hasAppUserToken()) {
      apiV2('/api/v2/auth/me')
        .then(data => setSavedIds((data.user?.savedProviders || []).map(String)))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!categorySlug) return;
    dispatch(
      searchProvidersV2Thunk({
        categorySlug,
        lat: location?.lat,
        lng: location?.lng,
        radiusMiles: location?.radiusMiles,
        sort,
      })
    );
  }, [dispatch, categorySlug, location?.lat, location?.lng, location?.radiusMiles, sort]);

  const handleSmartSearchResult = result => {
    if (result.type === 'navigation') {
      const msg = applySmartSearchNavigation(result.target, { history, onSortChange: setSort });
      setNavMessage(msg);
      return;
    }
    if (result.type === 'category') {
      setNavMessage(null);
      history.push(`/providers-v2/${result.categorySlug}`);
    }
  };

  const toggleSave = business => {
    if (!hasAppUserToken()) {
      history.push(`/auth-v2?returnTo=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const id = String(business._id);
    const isSaved = savedIds.includes(id);
    const method = isSaved ? 'DELETE' : 'POST';
    setSavedIds(prev => (isSaved ? prev.filter(x => x !== id) : [...prev, id]));
    apiV2(`/api/v2/me/saved-providers/${id}`, { method }).catch(() => {
      // Roll back on failure so the heart reflects the real saved state.
      setSavedIds(prev => (isSaved ? [...prev, id] : prev.filter(x => x !== id)));
    });
  };

  const activeCategory = useMemo(
    () => categories.find(c => c.slug === categorySlug),
    [categories, categorySlug]
  );

  return (
    <div className={css.root}>
      <div className={css.searchHeader}>
        <SmartSearchBox location={location} onResult={handleSmartSearchResult} />
        {navMessage && <p className={css.navMessage}>{navMessage}</p>}
        <LocationControl value={location} onChange={setLocation} label="Where" />
      </div>

      {categories.length > 0 && (
        <div className={css.categoryChips}>
          {categories.map(c => (
            <Link
              key={c.slug}
              to={`/providers-v2/${c.slug}`}
              className={c.slug === categorySlug ? css.chipActive : css.chip}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <div className={css.resultsHeader}>
        <h1 className={css.title}>{activeCategory?.name || searchPage.categoryName || categorySlug}</h1>
        <label className={css.sortControl}>
          Sort by
          <select value={sort} onChange={e => setSort(e.target.value)}>
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {searchPage.searchedNear && (
        <p className={css.searchedNear}>
          Showing results within {searchPage.searchedNear.radiusMiles} miles, currently accepting new jobs.
        </p>
      )}

      {searchPage.searchInProgress && <p>Searching…</p>}

      {searchPage.notFound && <p className={css.errorText}>There's no "{categorySlug}" category.</p>}
      {searchPage.searchError && !searchPage.notFound && (
        <p className={css.errorText}>Something went wrong searching. Please try again.</p>
      )}

      {!searchPage.searchInProgress && !searchPage.searchError && searchPage.data.length === 0 && (
        <p>
          No providers found in this category yet{location?.lat ? ' near you' : ''}. Try a larger radius or a
          different category.
        </p>
      )}

      <ul className={css.resultsList}>
        {searchPage.data.map(business => (
          <li key={business._id} className={css.resultCard}>
            <button
              type="button"
              className={savedIds.includes(String(business._id)) ? css.saveButtonActive : css.saveButton}
              onClick={() => toggleSave(business)}
              aria-label="Save provider"
              title={savedIds.includes(String(business._id)) ? 'Remove from saved' : 'Save this provider'}
            >
              ♥
            </button>
            <Link to={`/provider-v2/${business._id}`} className={css.resultLink}>
              <p className={css.resultName}>{business.name}</p>
              {business.ratingCount > 0 ? (
                <p className={css.resultRating}>
                  {business.ratingAvg.toFixed(1)} ★ ({business.ratingCount})
                </p>
              ) : (
                <p className={css.resultRatingNew}>New provider</p>
              )}
              <p className={css.resultBio}>{business.bio}</p>
              {business.serviceAreaLabel && <p className={css.resultDetail}>{business.serviceAreaLabel}</p>}
              {typeof business.distanceMeters === 'number' && (
                <p className={css.resultDetail}>{(business.distanceMeters / 1609.344).toFixed(1)} mi away</p>
              )}
            </Link>
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
