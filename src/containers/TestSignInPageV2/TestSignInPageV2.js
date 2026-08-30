/**
 * src/containers/TestSignInPageV2/TestSignInPageV2.js
 *
 * The new backend's sign-in screen: pick a role, enter name + email, no password - the "test
 * mode" entry point while real password-based login is still to come ("we'll use mongo for auth
 * later"). Unlike the old, now-removed TesterAuthPage, this creates a REAL MongoDB AppUser (see
 * server/api/v2/auth/testSignup.js) - the same account model signup.js/bridge.js use - so nothing
 * here has to be redone when real passwords get added later.
 *
 * Deliberately public (no `auth: true` in routeConfiguration.js) - this page IS the way in.
 * Every other -v2 page checks `hasAppUserToken()` itself and links back here if it's missing,
 * rather than relying on Sharetribe's router-level auth gate (see ProviderProfilePageV2.js for
 * the pattern).
 *
 * @component
 */
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { NamedLink, PrimaryButton } from '../../components';
import { testSignInThunk } from './TestSignInPageV2.duck';

import css from './TestSignInPageV2.module.css';

const ROLES = [
  { value: 'customer', label: 'Customer' },
  { value: 'provider', label: 'Provider' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TestSignInPageV2 = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const page = useSelector(state => state.TestSignInPageV2);

  const [role, setRole] = useState('customer');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState(null);

  const handleSubmit = e => {
    e.preventDefault();
    const trimmedFirstName = firstName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedFirstName) {
      setFormError('Please enter your name.');
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    setFormError(null);

    dispatch(
      testSignInThunk({
        email: trimmedEmail,
        firstName: trimmedFirstName,
        lastName: lastName.trim(),
        role,
      })
    ).then(action => {
      if (action.meta.requestStatus !== 'fulfilled') return;
      // Send providers straight into profile setup - the thing the old flow made "literally not
      // visible" - and customers to browse. Either destination works for either role afterward;
      // an account can hold more than one role (see AppUser.js), this just picks a sensible first
      // stop.
      history.push(role === 'provider' ? '/provider-profile-v2' : '/providers-v2/ride');
    });
  };

  if (page.user) {
    const roleLabel = page.user.roles.includes('provider') ? 'Provider' : 'Customer';
    return (
      <div className={css.root}>
        <div className={css.card}>
          <h1 className={css.heading}>You&apos;re signed in</h1>
          <p className={css.text}>
            Signed in as <strong>{page.user.firstName}</strong> ({roleLabel}) - {page.user.email}.
          </p>
          <div className={css.actions}>
            <NamedLink name="ProviderProfilePageV2" className={css.primaryLink}>
              Set up your provider profile
            </NamedLink>
            <NamedLink
              name="ProviderSearchPageV2"
              params={{ categorySlug: 'ride' }}
              className={css.secondaryLink}
            >
              Browse services
            </NamedLink>
            <NamedLink name="MyBookingsPageV2" className={css.secondaryLink}>
              My bookings
            </NamedLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={css.root}>
      <div className={css.card}>
        <h1 className={css.heading}>Sign in</h1>
        <p className={css.text}>
          Test mode - no password yet, just your name and email. This creates a real account you
          keep; a real password gets added to it later.
        </p>

        <form className={css.form} onSubmit={handleSubmit}>
          <div className={css.roleGroup}>
            {ROLES.map(r => (
              <button
                key={r.value}
                type="button"
                className={
                  role === r.value ? `${css.roleButton} ${css.roleButtonSelected}` : css.roleButton
                }
                onClick={() => setRole(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <label className={css.label} htmlFor="test-signin-firstName">
            First name
          </label>
          <input
            id="test-signin-firstName"
            type="text"
            className={css.input}
            placeholder="Jane"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            maxLength={80}
            autoFocus
          />

          <label className={css.label} htmlFor="test-signin-lastName">
            Last name
          </label>
          <input
            id="test-signin-lastName"
            type="text"
            className={css.input}
            placeholder="Doe"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            maxLength={80}
          />

          <label className={css.label} htmlFor="test-signin-email">
            Email
          </label>
          <input
            id="test-signin-email"
            type="email"
            className={css.input}
            placeholder="you@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            maxLength={255}
          />

          {formError ? <p className={css.errorText}>{formError}</p> : null}
          {page.signInError ? (
            <p className={css.errorText}>
              {page.signInError.message || 'Something went wrong. Please try again.'}
            </p>
          ) : null}

          <PrimaryButton type="submit" inProgress={page.signInInProgress} disabled={page.signInInProgress}>
            Continue
          </PrimaryButton>
        </form>

        <NamedLink name="LandingPage" className={css.backLink}>
          ← Back to Servio
        </NamedLink>
      </div>
    </div>
  );
};

export default TestSignInPageV2;
