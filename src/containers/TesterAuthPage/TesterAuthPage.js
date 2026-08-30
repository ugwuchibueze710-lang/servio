import React, { useEffect, useState } from 'react';

import { NamedLink, PrimaryButton, SecondaryButton } from '../../components';
import { getStoredTesterSession, testerSignup, testerLogout } from '../../util/testerAuth';

import css from './TesterAuthPage.module.css';

const ROLES = [
  { value: 'customer', label: 'Customer' },
  { value: 'provider', label: 'Provider' },
];

/**
 * TesterAuthPage
 *
 * A deliberately minimal, no-email sign up / log in flow for early testers: pick a role, type a
 * name, and you're in - no password, no verification email. Every account created here is
 * temporary (see server/state/testerAccounts.js) and disappears on its own a few hours later, by
 * design - this is NOT the marketplace's real account system, just a fast way for testers to get
 * past the front door while that's being built out (see MIGRATION_PLAN.md).
 *
 * This replaces what used to render at /login, /signup and /signup/:userType (see
 * routeConfiguration.js). The original Sharetribe-backed AuthenticationPage.js is untouched and
 * simply no longer linked from those routes, so switching back later is just a matter of
 * pointing those three route entries at it again.
 *
 * @component
 */
const TesterAuthPage = () => {
  const [session, setSession] = useState(null);
  const [checkedStorage, setCheckedStorage] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('customer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSession(getStoredTesterSession());
    setCheckedStorage(true);
  }, []);

  const handleSubmit = async e => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const data = await testerSignup({ name: trimmedName, role });
      setSession({ token: data.token, user: data.user });
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    await testerLogout();
    setSession(null);
    setName('');
    setSubmitting(false);
  };

  // Avoid a one-frame flash of the signup form before we've checked for an existing session.
  if (!checkedStorage) {
    return <div className={css.root} />;
  }

  if (session) {
    const { user } = session;
    const roleLabel = user.role === 'provider' ? 'Provider' : 'Customer';
    return (
      <div className={css.root}>
        <div className={css.card}>
          <h1 className={css.heading}>You&apos;re signed in</h1>
          <p className={css.text}>
            Signed in as <strong>{user.name}</strong> ({roleLabel}). This is a temporary test
            account and will be removed automatically in a few hours.
          </p>
          <div className={css.actions}>
            <NamedLink name="LandingPage" className={css.primaryLink}>
              Continue to Servio
            </NamedLink>
            <SecondaryButton type="button" onClick={handleSignOut} inProgress={submitting}>
              Sign out / use a different name
            </SecondaryButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={css.root}>
      <div className={css.card}>
        <h1 className={css.heading}>Sign up or log in</h1>
        <p className={css.text}>
          This is a testing build - no email or password needed. Pick a role, enter a name, and
          you&apos;re in. Test accounts are temporary and are removed automatically after a few
          hours.
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

          <label className={css.label} htmlFor="tester-name">
            Name
          </label>
          <input
            id="tester-name"
            type="text"
            className={css.input}
            placeholder="Jane Doe"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />

          {error ? <p className={css.errorText}>{error}</p> : null}

          <PrimaryButton type="submit" inProgress={submitting} disabled={submitting}>
            Get started
          </PrimaryButton>
        </form>

        <NamedLink name="LandingPage" className={css.backLink}>
          ← Back to Servio
        </NamedLink>
      </div>
    </div>
  );
};

export default TesterAuthPage;
