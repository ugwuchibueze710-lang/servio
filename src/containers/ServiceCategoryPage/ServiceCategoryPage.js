import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { createResourceLocatorString } from '../../util/routes';
import { isScrollingDisabled } from '../../ducks/ui.duck';

import { Heading, Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import serviceCategories from '../../config/configServiceCategories';
import serviceAreas from '../../config/configServiceAreas';

import css from './ServiceCategoryPage.module.css';

/**
 * SEO landing page for a single service category, e.g. /services/plumbing
 *
 * This page renders real, unique content (title/description/H1) per category and links into a
 * genuine, working SearchPage query (pub_categoryLevel1=<id>) - it does not fabricate listings or
 * results. It has no data to load itself (all content is local, editable copy), so it does not need
 * a .duck.js loadData function - see AGENTS.md exception for client-rendered-only content.
 *
 * @component
 */
export const ServiceCategoryPageComponent = props => {
  const { params, scrollingDisabled } = props;
  const { categorySlug } = params || {};
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const history = useHistory();
  const intl = useIntl();

  const category = serviceCategories.find(c => c.id === categorySlug);
  const marketplaceName = config.marketplaceName;

  if (!category) {
    return (
      <Page title="Category not found" scrollingDisabled={scrollingDisabled}>
        <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
          <div className={css.root}>
            <Heading as="h1" rootClassName={css.heading}>
              We couldn&apos;t find that category
            </Heading>
            <NamedLink name="SearchPage" className={css.ctaLink}>
              Browse all services
            </NamedLink>
          </div>
        </LayoutSingleColumn>
      </Page>
    );
  }

  const title = `${category.name} services near you | ${marketplaceName}`;
  const description = `${category.blurb} Post a job or request quotes from local, background-checkable ${category.shortName} pros on ${marketplaceName}.`;

  // Ride isn't a browsable listings category like the others - it's a
  // direct-action page (real-time driver dispatch, not a search result
  // list) - see RIDE_INTEGRATION_REPORT.md. Every other category keeps the
  // existing SearchPage behavior unchanged.
  const isRideCategory = category.id === 'ride';

  const handleBrowseClick = () => {
    if (isRideCategory) {
      history.push(createResourceLocatorString('RidePage', routeConfiguration, {}, {}));
      return;
    }
    const searchParams = { pub_categoryLevel1: category.id };
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
              {category.name} near you
            </Heading>
            <p className={css.lead}>{category.blurb}</p>
            <div className={css.ctaRow}>
              <button className={css.ctaButton} onClick={handleBrowseClick} type="button">
                {isRideCategory ? 'Request a ride' : `Browse verified ${category.shortName} pros`}
              </button>
              {isRideCategory ? (
                <NamedLink name="DriverRidePage" className={css.ctaSecondary}>
                  Drive with Servio
                </NamedLink>
              ) : (
                <NamedLink name="NewListingPage" className={css.ctaSecondary}>
                  Post a {category.shortName} job
                </NamedLink>
              )}
            </div>
          </div>

          <section className={css.section}>
            <Heading as="h2" rootClassName={css.subheading}>
              How {marketplaceName} works for {category.shortName}
            </Heading>
            <ol className={css.steps}>
              <li>Describe the job, your budget, and when you need it done - photos help providers quote accurately.</li>
              <li>Local {category.shortName} providers respond with quotes and questions through SERVIO messaging.</li>
              <li>Compare quotes and reviews, pick a provider, and pay securely through SERVIO when you accept.</li>
              <li>Leave a review once the job is done - it helps the next customer choose with confidence.</li>
            </ol>
          </section>

          <section className={css.section}>
            <Heading as="h2" rootClassName={css.subheading}>
              {category.name} near these areas
            </Heading>
            <div className={css.areaLinks}>
              {serviceAreas.map(area => (
                <NamedLink
                  key={area.slug}
                  name="ServiceAreaPage"
                  params={{ citySlug: area.slug }}
                  className={css.areaLink}
                >
                  {category.name} in {area.label}
                </NamedLink>
              ))}
            </div>
          </section>

          <section className={css.section}>
            <Heading as="h2" rootClassName={css.subheading}>
              Other categories
            </Heading>
            <div className={css.areaLinks}>
              {serviceCategories
                .filter(c => c.id !== category.id)
                .slice(0, 8)
                .map(c => (
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
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

const ServiceCategoryPage = compose(connect(mapStateToProps))(ServiceCategoryPageComponent);

export default ServiceCategoryPage;
