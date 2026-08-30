import React from 'react';
import loadable from '@loadable/component';

import { bool, object } from 'prop-types';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { camelize } from '../../util/string';
import { propTypes } from '../../util/types';

import FallbackPage from './FallbackPage';
import { ASSET_NAME } from './LandingPage.duck';
import { fetchFeaturedListings } from '../../ducks/featuredListings.duck';
import { getListingsById } from '../../ducks/marketplaceData.duck';
import { getFeaturedListingsProps } from '../../util/data';
import CategoryHero from './CategoryHero/CategoryHero';

const PageBuilder = loadable(() =>
  import(/* webpackChunkName: "PageBuilder" */ '../PageBuilder/PageBuilder')
);

export const LandingPageComponent = props => {
  const { pageAssetsData, inProgress, error } = props;

  const landingPageData = pageAssetsData?.[camelize(ASSET_NAME)]?.data;

  // Servio's homepage is a working marketplace, not a marketing site with a marketplace bolted
  // on top of it: the hosted CMS "sections" for this page (the old "Why Choose Servio" / "For
  // Customers" / "For Providers" / "How Servio Works" content) are intentionally not rendered
  // here anymore. We still pass `meta` through untouched so page title/description/social-share
  // tags keep working, and PageBuilder is still used as-is (unmodified) so the site's shared
  // Topbar and Footer keep rendering exactly like they do on every other page - only the
  // marketing body content in between them is suppressed. Nothing about the hosted asset itself
  // changes; a marketplace operator could still re-enable it by rendering `sections` again here.
  const landingPageDataWithoutMarketingSections = landingPageData
    ? { ...landingPageData, sections: [] }
    : landingPageData;

  return (
    <>
      <CategoryHero />
      <PageBuilder
        pageAssetsData={landingPageDataWithoutMarketingSections}
        inProgress={inProgress}
        error={error}
        fallbackPage={<FallbackPage error={error} />}
        featuredListings={getFeaturedListingsProps(camelize(ASSET_NAME), props)}
      />
    </>
  );
};

LandingPageComponent.propTypes = {
  pageAssetsData: object,
  inProgress: bool,
  error: propTypes.error,
};

const mapStateToProps = state => {
  const { pageAssetsData, inProgress, error } = state.hostedAssets || {};
  const featuredListingData = state.featuredListings || {};

  const getListingEntitiesById = listingIds => getListingsById(state, listingIds);

  return { pageAssetsData, featuredListingData, getListingEntitiesById, inProgress, error };
};

const mapDispatchToProps = dispatch => ({
  onFetchFeaturedListings: (sectionId, parentPage, listingImageConfig, allSections) =>
    dispatch(fetchFeaturedListings({ sectionId, parentPage, listingImageConfig, allSections })),
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const LandingPage = compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(LandingPageComponent);

export default LandingPage;
