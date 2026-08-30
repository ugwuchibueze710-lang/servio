/**
 * src/components/AccountMenuV2/AccountMenuV2.js
 *
 * The real account menu for the Mongo-backed app (spec section 1/4): one account, two modes,
 * switched from a three-line menu - "Switch to Provider Mode" / "Switch to Customer Mode" -
 * never a separate signup flow. Persists the choice for real (PATCH /api/v2/me/mode) rather than
 * the pre-existing src/util/marketplaceMode.js, which is a client-only localStorage preference
 * wired to the old Sharetribe listings flow (ManageListingsPage/NewListingPage) - a genuinely
 * different, disconnected "mode" concept from this one. This menu only renders once a real
 * AppUser session exists (checked client-side, see the mounted/signedIn pattern used elsewhere
 * in this app, e.g. ProviderProfilePageV2.js), independent of whatever Sharetribe auth state the
 * legacy Topbar's own ProfileMenu depends on.
 */
import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';

import { Menu, MenuLabel, MenuContent, MenuItem, InlineTextButton } from '../../components';
import { apiV2, clearAppUserToken, hasAppUserToken } from '../../util/apiV2';

import css from './AccountMenuV2.module.css';

const AccountMenuV2 = () => {
  const history = useHistory();
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!hasAppUserToken()) return;
    setSignedIn(true);
    apiV2('/api/v2/auth/me')
      .then(data => setUser(data.user))
      .catch(() => {});
    apiV2('/api/v2/notifications?unreadOnly=true')
      .then(data => setUnreadCount(data.unreadCount || 0))
      .catch(() => {});
  }, []);

  if (!signedIn) return null;

  const activeMode = user?.activeMode || 'customer';

  const switchMode = async nextMode => {
    setUser(prev => (prev ? { ...prev, activeMode: nextMode } : prev));
    try {
      await apiV2('/api/v2/me/mode', { method: 'PATCH', body: { activeMode: nextMode } });
    } catch (e) {
      // Not fatal to navigation - the destination page itself works regardless of whether the
      // preference persisted; it'll just be asked again next visit.
    }
    history.push(nextMode === 'provider' ? '/provider-inbox-v2' : '/my-bookings-v2');
  };

  const handleSignOut = () => {
    clearAppUserToken();
    setSignedIn(false);
    setUser(null);
    history.push('/');
  };

  return (
    <Menu skipFocusOnNavigation={true}>
      <MenuLabel className={css.menuLabel} isOpenClassName={css.menuLabelOpen} ariaLabel="Account menu">
        <span className={css.hamburger}>
          <span />
          <span />
          <span />
        </span>
      </MenuLabel>
      <MenuContent className={css.menuContent}>
        {user && (
          <MenuItem key="userInfo" rootClassName={css.userInfoItem}>
            {user.firstName} {user.lastName}
          </MenuItem>
        )}
        {activeMode === 'customer' ? (
          <MenuItem key="switchToProvider">
            <InlineTextButton rootClassName={css.menuLink} onClick={() => switchMode('provider')}>
              Switch to Provider Mode
            </InlineTextButton>
          </MenuItem>
        ) : (
          <MenuItem key="switchToCustomer">
            <InlineTextButton rootClassName={css.menuLink} onClick={() => switchMode('customer')}>
              Switch to Customer Mode
            </InlineTextButton>
          </MenuItem>
        )}
        <MenuItem key="myRequests">
          <InlineTextButton rootClassName={css.menuLink} onClick={() => history.push('/my-bookings-v2')}>
            My requests
          </InlineTextButton>
        </MenuItem>
        <MenuItem key="providerDashboard">
          <InlineTextButton rootClassName={css.menuLink} onClick={() => history.push('/provider-inbox-v2')}>
            Provider dashboard
          </InlineTextButton>
        </MenuItem>
        <MenuItem key="notifications">
          <InlineTextButton rootClassName={css.menuLink} onClick={() => history.push('/notifications-v2')}>
            Notifications{unreadCount > 0 ? <span className={css.unreadBadge}>{unreadCount}</span> : null}
          </InlineTextButton>
        </MenuItem>
        <MenuItem key="signOut">
          <InlineTextButton rootClassName={css.menuLink} onClick={handleSignOut}>
            Sign out
          </InlineTextButton>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
};

export default AccountMenuV2;
