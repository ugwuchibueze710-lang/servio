/**
 * src/components/magicui/BlurFade.js
 *
 * A local, plain-JS port of Magic UI's BlurFade component
 * (https://magicui.design/docs/components/blur-fade), trimmed to what Servio actually uses:
 * a one-time, on-mount fade + slide + blur-in for a piece of content, built on the `motion`
 * package (the same one Magic UI's own source imports as `motion/react`). No Tailwind required -
 * the animation is driven entirely by motion's `initial`/`animate` props, so it drops into this
 * CSS-Modules codebase as-is.
 *
 * Used for entrance polish only (e.g. the homepage's "What service do you need?" heading) - it
 * never wraps or affects the locked category grid/tiles.
 *
 * Respects prefers-reduced-motion automatically: motion's `useReducedMotion` hook (used
 * internally by `MotionConfig`/`motion` components when `reducedMotion="user"` is set) is applied
 * once at the root via `<MotionConfig>` below, so every BlurFade on the page skips the animation
 * (renders in its final state immediately) for anyone with that OS/browser preference set.
 */
import React from 'react';
import { motion, MotionConfig } from 'motion/react';

const DIRECTION_OFFSETS = {
  up: { y: 8 },
  down: { y: -8 },
  left: { x: 8 },
  right: { x: -8 },
};

/**
 * @component
 * @param {Object} props
 * @param {ReactNode} props.children
 * @param {'up'|'down'|'left'|'right'} [props.direction='up']
 * @param {number} [props.duration=0.35] seconds
 * @param {number} [props.delay=0] seconds
 * @param {string} [props.blur='6px']
 * @param {string} [props.as='div'] rendered wrapper element
 * @param {string} [props.className]
 * @returns {JSX.Element}
 */
const BlurFade = props => {
  const {
    children,
    direction = 'up',
    duration = 0.35,
    delay = 0,
    blur = '6px',
    as = 'div',
    className,
  } = props;

  const offset = DIRECTION_OFFSETS[direction] || DIRECTION_OFFSETS.up;
  const MotionTag = motion[as] || motion.div;

  return (
    <MotionConfig reducedMotion="user">
      <MotionTag
        className={className}
        initial={{ opacity: 0, filter: `blur(${blur})`, ...offset }}
        animate={{ opacity: 1, filter: 'blur(0px)', x: 0, y: 0 }}
        transition={{ duration, delay, ease: 'easeOut' }}
      >
        {children}
      </MotionTag>
    </MotionConfig>
  );
};

export default BlurFade;
