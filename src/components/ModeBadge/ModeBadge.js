/**
 * src/components/ModeBadge/ModeBadge.js
 *
 * A small pill shown in the account menu (desktop dropdown + mobile menu) that names whichever
 * of the two modes - Customer or Provider - is currently active, so switching modes reads as a
 * real, visible state change instead of a silent link swap underneath an unlabeled menu.
 *
 * Purely presentational: it just reads `viewMode` (see util/marketplaceMode.js) and renders a
 * label + colored dot, with a quick crossfade whenever viewMode changes. It does not decide the
 * mode, switch it, or gate any functionality - Topbar.js/TopbarDesktop.js/TopbarMobileMenu.js
 * still own all of that exactly as before.
 *
 * Returns null until viewMode has resolved on the client (it starts as null - see Topbar.js -
 * to keep first paint hydration-safe), so it never flashes an incorrect mode.
 *
 * @component
 */
import React from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import classNames from 'classnames';

import { FormattedMessage } from '../../util/reactIntl';
import { MODE_PROVIDER } from '../../util/marketplaceMode';

import css from './ModeBadge.module.css';

const ModeBadge = props => {
  const { viewMode, className, rootClassName } = props;

  if (!viewMode) {
    return null;
  }

  const isProvider = viewMode === MODE_PROVIDER;
  const classes = classNames(rootClassName || css.root, className);

  return (
    <span className={classes}>
      <span
        className={isProvider ? css.dotProvider : css.dotCustomer}
        aria-hidden="true"
      />
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={viewMode}
            className={css.label}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {isProvider ? (
              <FormattedMessage id="ModeBadge.providerMode" defaultMessage="Provider Mode" />
            ) : (
              <FormattedMessage id="ModeBadge.customerMode" defaultMessage="Customer Mode" />
            )}
          </motion.span>
        </AnimatePresence>
      </MotionConfig>
    </span>
  );
};

export default ModeBadge;
