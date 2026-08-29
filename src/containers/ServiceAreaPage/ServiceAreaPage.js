import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { createResourceLocatorString } from '../../util/routes';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { types as sdkTypes } from '../../util/sdkLoader';

import { Heading, Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import serviceCategories from '../../config/configServiceCategories';
import serviceAreas from '../../config/configServiceAreas';

import css from './ServiceAreaPage.module.css';

const { LatLng, LatLngBounds } = sdkTypes;

/**
 * SEO landing page for a single local service area, e.g. /location/owensboro-ky
 *
 * Renders real, unique content per city and links into a genuine, working SearchPage query
 * (address + bounds) - the same search the main search bar performs, just pre-filled. No fake
 * listings or stats are shown. No .duck.js loadData is needed since all content here is local,
 * static copy - see AGENTS.md exception for client-rendered-only content.
 *
 * @component
 */
export const ServiceAreaPageComponent = props => {
  const { params, scrollingDisabled } = props;
  const { citySlug } = params || {};
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const history = useHistory();

  const area = serviceAreas.find(a => a.slug === citySlug);
  const marketplaceName = config.marketplaceName;

  if (!area) {
    return (
      <Page title="Area not found" scrollingDisabled={scrollingDisabled}>
        <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
          <div className={css.root}>
            <Heading as="h1" rootClassName={css.heading}>
              We don&apos;t have a page for that area yet
            </Heading>
            <NamedLink name="SearchPage" className={css.ctaLink}>
              Search all of {marketplaceName}
            </NamedLink>
          </div>
        </LayoutSingleColumn>
      </Page>
    );
  }

  const title = `Local service providers in ${area.label} | ${marketplaceName}`;
  const description = `Find and book trusted, local service providers in ${area.label} - home services, cleaning, auto, events and more. Post a job or browse pros on ${marketplaceName}.`;

  const handleBrowseClick = () => {
    const bounds = new LatLngBounds(
      new LatLng(area.bounds.ne.lat, area.bounds.ne.lng),
      new LatLng(area.bounds.sw.lat, area.bounds.sw.lng)
    );
    const searchParams = { address: area.label, bounds };
    history.push(createResourceLocatorString('SearchPage', routeConfiguration, {}, searchParams));
  };

  return (
    <Page
      title={title}
      description={description}
      schema={{
        '@context': 'http://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
      }}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <div className={css.hero}>
            <Heading as="h1" rootClassName={css.heading}>
              Local pros in {area.label}
            </Heading>
            <p className={css.lead}>
              {marketplaceName} connects {area.city} homeowners and businesses with background-checkable
              local service providers - post what you need done, get quotes, and pay securely once you
              accept.
            </p>
            <div className={css.ctaRow}>
              <button className={css.ctaButton} onClick={handleBrowseClick} type="button">
                Browse pros near {area.city}
              </button>
              <NamedLink name="NewListingPage" className={css.ctaSecondary}>
                Post a job in {area.city}
              </NamedLink>
            </div>
          </div>

          <section className={css.section}>
            <Heading as="h2" rootClassName={css.subheading}>
              Popular categories in {area.label}
            </Heading>
            <div className={css.areaLinks}>
              {serviceCategories.slice(0, 12).map(c => (
                <NamedLink
                  key={c.id}
                  name="ServiceCategoryPage"
                  params={{ categorySlug: c.id }}
                  className={css.areaLink}
                >
                  {c.name}
                </NamedLink>
              ))}
            </div>
          </section>

          <section className={css.section}>
            <Heading as="h2" rootClassName={css.subheading}>
              Other areas SERVIO serves
            </Heading>
            <div className={css.areaLinks}>
              {serviceAreas
                .filter(a => a.slug !== area.slug)
                .map(a => (
                  <NamedLink
                    key={a.slug}
                    name="ServiceAreaPage"
                    params={{ citySlug: a.slug }}
                    className={css.areaLink}
                  >
                    {a.label}
                  </NamedLink>
                ))}
            </div>
          </section>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

const ServiceAreaPage = compose(connect(mapStateToProps))(ServiceAreaPageComponent);

export default ServiceAreaPage;
