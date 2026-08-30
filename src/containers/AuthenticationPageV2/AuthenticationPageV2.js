/**
 * src/containers/AuthenticationPageV2/AuthenticationPageV2.js
 *
 * Real sign up / sign in - the actual entry point for the whole app (see this folder's .duck.js
 * header for why this replaces TestSignInPageV2). One account, no per-role signup choice here:
 * every new account starts in customer mode (spec section 1/4) and can enable provider mode
 * later from the account menu (task #50) - so this form only ever asks for name/email/password.
 *
 * @component
 */
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';

import { NamedLink, PrimaryButton } from '../../components';
import { hasAppUserToken } from '../../util/apiV2';
import { signUpThunk, logInThunk, clearAuthError } from './AuthenticationPageV2.duck';

import css from './AuthenticationPageV2.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AuthenticationPageV2 = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const page = useSelector(state => state.AuthenticationPageV2);

  const params = new URLSearchParams(location.search);
  const initialTab = params.get('tab') === 'signup' ? 'signup' : 'login';
  const [tab, setTab] = useState(initialTab);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState(null);

  const switchTab = next => {
    setTab(next);
    setFormError(null);
    dispatch(clearAuthError());
  };

  const redirectAfterAuth = () => {
    const returnTo = params.get('returnTo');
    history.push(returnTo || '/providers-v2/home-cleaning');
  };

  const handleSubmit = e => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!EMAIL_RE.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setFormError('Please enter your password.');
      return;
    }
    if (tab === 'signup' && (!firstName.trim() || !lastName.trim())) {
      setFormError('Please enter your first and last name.');
      return;
    }
    if (tab === 'signup' && password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }
    setFormError(null);

    const action =
      tab === 'signup'
        ? signUpThunk({ email: trimmedEmail, password, firstName: firstName.trim(), lastName: lastName.trim() })
        : logInThunk({ email: trimmedEmail, password });

    dispatch(action).then(result => {
      if (result.meta.requestStatus === 'fulfilled') {
        redirectAfterAuth();
      }
    });
  };

  if (page.user || hasAppUserToken()) {
    return (
      <div className={css.root}>
        <div className={css.card}>
          <h1 className={css.heading}>You&apos;re signed in</h1>
          {page.user && (
            <p className={css.text}>
              Signed in as <strong>{page.user.firstName}</strong> - {page.user.email}.
            </p>
          )}
          <div className={css.actions}>
            <NamedLink name="ProviderSearchPageV2" params={{ categorySlug: 'home-cleaning' }} className={css.primaryLink}>
              Browse services
            </NamedLink>
            <NamedLink name="MyBookingsPageV2" className={css.secondaryLink}>
              My requests
            </NamedLink>
          </div>
        </div>
      </div>
    );
  }

  const apiError = page.submitError?.message;

  return (
    <div className={css.root}>
      <div className={css.card}>
        <div className={css.tabs}>
          <button
            type="button"
            className={tab === 'login' ? css.tabActive : css.tab}
            onClick={() => switchTab('login')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={tab === 'signup' ? css.tabActive : css.tab}
            onClick={() => switchTab('signup')}
          >
            Create account
          </button>
        </div>

        <form className={css.form} onSubmit={handleSubmit}>
          {tab === 'signup' && (
            <div className={css.nameRow}>
              <input
                className={css.input}
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
              <input
                className={css.input}
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          )}
          <input
            className={css.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className={css.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
          />

          {(formError || apiError) && <p className={css.errorText}>{formError || apiError}</p>}

          <PrimaryButton type="submit" inProgress={page.submitInProgress}>
            {tab === 'signup' ? 'Create account' : 'Sign in'}
          </PrimaryButton>
        </form>

        <p className={css.switchPrompt}>
          {tab === 'login' ? (
            <>Don&apos;t have an account? <button type="button" className={css.linkButton} onClick={() => switchTab('signup')}>Create one</button></>
          ) : (
            <>Already have an account? <button type="button" className={css.linkButton} onClick={() => switchTab('login')}>Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
};

export default AuthenticationPageV2;
