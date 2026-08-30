/**
 *  TopbarMobileMenu prints the menu content for authenticated user or
 * shows login actions for those who are not authenticated.
 */
import React from 'react';
import classNames from 'classnames';

import { ACCOUNT_SETTINGS_PAGES } from '../../../../routing/routeConfiguration';
import { FormattedMessage } from '../../../../util/reactIntl';
import { ensureCurrentUser } from '../../../../util/data';
import { MODE_CUSTOMER, MODE_PROVIDER } from '../../../../util/marketplaceMode';

import {
  AvatarLarge,
  ExternalLink,
  InlineTextButton,
  NamedLink,
  NotificationBadge,
} from '../../../../components';

import ModeBadge from '../../../../components/ModeBadge/ModeBadge';

import css from './TopbarMobileMenu.module.css';

const CustomLinkComponent = ({ linkConfig, currentPage }) => {
  const { group, text, type, href, route } = linkConfig;
  const getCurrentPageClass = page => {
    const hasPageName = name => currentPage?.indexOf(name) === 0;
    const isCMSPage = pageId => hasPageName('CMSPage') && currentPage === `${page}:${pageId}`;
    const isInboxPage = tab => hasPageName('InboxPage') && currentPage === `${page}:${tab}`;
    const isCurrentPage = currentPage === page;

    return isCMSPage(route?.params?.pageId) || isInboxPage(route?.params?.tab) || isCurrentPage
      ? css.currentPage
      : null;
  };

  // Note: if the config contains 'route' keyword,
  // then in-app linking config has been resolved already.
  if (type === 'internal' && route) {
    // Internal link
    const { name, params, to } = route || {};
    const className = classNames(css.navigationLink, getCurrentPageClass(name));
    return (
      <li className={className}>
        <NamedLink name={name} params={params} to={to}>
          <span className={css.menuItemBorder} />
          {text}
        </NamedLink>
      </li>
    );
  }
  return (
    <li className={css.navigationLink}>
      <ExternalLink href={href}>
        <span className={css.menuItemBorder} />
        {text}
      </ExternalLink>
    </li>
  );
};

/**
 * Menu for mobile layout (opens through hamburger icon)
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.isAuthenticated
 * @param {string?} props.currentPage
 * @param {boolean} props.currentUserHasListings
 * @param {Object?} props.currentUser API entity
 * @param {number} props.notificationCount
 * @param {Array<Object>} props.customLinks Contains object like { group, text, type, href, route }
 * @param {Function} props.onLogout
 * @param {string?} props.viewMode 'customer' | 'provider' - which mode this menu currently shows
 * @param {boolean} props.showProviderModeSwitch whether this account is allowed a provider role
 * @param {boolean} props.showCustomerModeSwitch whether this account is allowed a customer role
 * @param {Function} props.onSwitchToProviderMode
 * @param {Function} props.onSwitchToCustomerMode
 * @returns {JSX.Element} search icon
 */
const TopbarMobileMenu = props => {
  const {
    isAuthenticated,
    currentPage,
    inboxTab,
    currentUser,
    notificationCount = 0,
    customLinks,
    onLogout,
    showCreateListingsLink,
    viewMode,
    showProviderModeSwitch,
    showCustomerModeSwitch,
    onSwitchToProviderMode,
    onSwitchToCustomerMode,
  } = props;

  const user = ensureCurrentUser(currentUser);

  const extraLinks = customLinks.map((linkConfig, index) => {
    return (
      <CustomLinkComponent
        key={`${linkConfig.text}_${index}`}
        linkConfig={linkConfig}
        currentPage={currentPage}
      />
    );
  });

  const createListingsLinkMaybe = showCreateListingsLink ? (
    <NamedLink className={css.createNewListingLink} name="NewListingPage">
      <FormattedMessage id="TopbarMobileMenu.newListingLink" />
    </NamedLink>
  ) : null;

  if (!isAuthenticated) {
    const signup = (
      <NamedLink name="SignupPage" className={css.signupLink}>
        <FormattedMessage id="TopbarMobileMenu.signupLink" />
      </NamedLink>
    );

    const login = (
      <NamedLink name="LoginPage" className={css.loginLink}>
        <FormattedMessage id="TopbarMobileMenu.loginLink" />
      </NamedLink>
    );

    const signupOrLogin = (
      <span className={css.authenticationLinks}>
        <FormattedMessage
          id="TopbarMobileMenu.signupOrLogin"
          values={{ lineBreak: <br />, signup, login }}
        />
      </span>
    );
    return (
      <nav className={css.root}>
        <div className={css.content}>
          <div className={css.authenticationGreeting}>
            <FormattedMessage
              id="TopbarMobileMenu.unauthorizedGreeting"
              values={{ lineBreak: <br />, signupOrLogin }}
            />
          </div>

          <ul className={css.customLinksWrapper}>{extraLinks}</ul>

          <div className={css.spacer} />
        </div>
        <div className={css.footer}>{createListingsLinkMaybe}</div>
      </nav>
    );
  }

  const notificationCountBadge =
    notificationCount > 0 ? (
      <NotificationBadge className={css.notificationBadge} count={notificationCount} />
    ) : null;

  const displayName = user.attributes.profile.firstName;
  const currentPageClass = page => {
    const isAccountSettingsPage =
      page === 'AccountSettingsPage' && ACCOUNT_SETTINGS_PAGES.includes(currentPage);
    const isInboxPage = currentPage?.indexOf('InboxPage') === 0 && page?.indexOf('InboxPage') === 0;
    return currentPage === page || isAccountSettingsPage || isInboxPage ? css.currentPage : null;
  };

  // "Your listings" only makes sense while Provider Mode is active - in Customer Mode, becoming
  // or returning to being a provider goes through the mode switch below instead, so the two
  // modes don't show two different paths to the same place at once.
  const manageListingsLinkMaybe = showCreateListingsLink && viewMode === MODE_PROVIDER ? (
    <li className={classNames(css.navigationLink, currentPageClass('ManageListingsPage'))}>
      <NamedLink name="ManageListingsPage">
        <FormattedMessage id="TopbarMobileMenu.yourListingsLink" />
      </NamedLink>
    </li>
  ) : null;

  // Mode switching is mutually exclusive: only the switch INTO the mode that isn't currently
  // active is ever shown, and only if the marketplace's role configuration allows that role for
  // this account (see getCurrentUserTypeRoles in util/userHelpers.js).
  const switchToProviderModeMaybe =
    showProviderModeSwitch && viewMode === MODE_CUSTOMER ? (
      <li className={css.navigationLink}>
        <InlineTextButton rootClassName={css.modeSwitchButton} onClick={onSwitchToProviderMode}>
          <FormattedMessage
            id="TopbarMobileMenu.switchToProviderMode"
            defaultMessage="Switch to Provider Mode"
          />
        </InlineTextButton>
      </li>
    ) : null;

  const switchToCustomerModeMaybe =
    showCustomerModeSwitch && viewMode === MODE_PROVIDER ? (
      <li className={css.navigationLink}>
        <InlineTextButton rootClassName={css.modeSwitchButton} onClick={onSwitchToCustomerMode}>
          <FormattedMessage
            id="TopbarMobileMenu.switchToCustomerMode"
            defaultMessage="Switch to Customer Mode"
          />
        </InlineTextButton>
      </li>
    ) : null;

  return (
    <div className={css.root}>
      <AvatarLarge className={css.avatar} user={currentUser} />
      <div className={css.content}>
        <span className={css.greeting}>
          <FormattedMessage id="TopbarMobileMenu.greeting" values={{ displayName }} />
        </span>
        <InlineTextButton rootClassName={css.logoutButton} onClick={onLogout}>
          <FormattedMessage id="TopbarMobileMenu.logoutLink" />
        </InlineTextButton>

        <ModeBadge viewMode={viewMode} className={css.modeBadge} />

        <ul className={css.accountLinksWrapper}>
          <li className={classNames(css.inbox, currentPageClass(`InboxPage:${inboxTab}`))}>
            <NamedLink name="InboxPage" params={{ tab: inboxTab }}>
              <FormattedMessage id="TopbarMobileMenu.inboxLink" />
              {notificationCountBadge}
            </NamedLink>
          </li>
          {manageListingsLinkMaybe}
          <li className={classNames(css.navigationLink, currentPageClass('ProfileSettingsPage'))}>
            <NamedLink name="ProfileSettingsPage">
              <FormattedMessage id="TopbarMobileMenu.profileSettingsLink" />
            </NamedLink>
          </li>
          <li className={classNames(css.navigationLink, currentPageClass('AccountSettingsPage'))}>
            <NamedLink name="AccountSettingsPage">
              <FormattedMessage id="TopbarMobileMenu.accountSettingsLink" />
            </NamedLink>
          </li>
          {switchToProviderModeMaybe}
          {switchToCustomerModeMaybe}
          <li className={classNames(css.navigationLink, currentPageClass('RidePage'))}>
            <NamedLink name="RidePage">
              <FormattedMessage
                id="TopbarMobileMenu.rideModeLink"
                defaultMessage="Switch to riding mode"
              />
            </NamedLink>
          </li>
          <li className={classNames(css.navigationLink, currentPageClass('DriverRidePage'))}>
            <NamedLink name="DriverRidePage">
              <FormattedMessage
                id="TopbarMobileMenu.driveModeLink"
                defaultMessage="Switch to driving mode"
              />
            </NamedLink>
          </li>
        </ul>
        <ul className={css.customLinksWrapper}>{extraLinks}</ul>
        <div className={css.spacer} />
      </div>
      <div className={css.footer}>{createListingsLinkMaybe}</div>
    </div>
  );
};

export default TopbarMobileMenu;
