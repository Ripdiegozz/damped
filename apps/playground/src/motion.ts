import type { AnimationTargets, MorphOptions } from "damped";
import { DEBUG } from "./debug";

// One place for the spring feel of the shell, so every surface moves with the same character.
export const SPRINGS = {
  /** Sidebar and content area resizing. */
  panel: { duration: 0.45, bounce: 0.12 },
  /** The pill behind the active nav item. A little bounce makes a quick succession of clicks feel physical. */
  indicator: { duration: 0.4, bounce: 0.2 },
  /** Views entering and leaving. */
  view: { duration: 0.3, bounce: 0 },
  /**
   * Figures counting to a new value: no bounce, so a currency amount never swings past its target. A spring decays
   * exponentially, and from 25,000 dollars away the last cents would crawl for seconds, so it counts as arrived once
   * it is within 25 cents and slower than 2 dollars a second.
   */
  number: { duration: 0.8, bounce: 0, restDelta: 0.25, restSpeed: 2 },
  /** The savings bar. */
  progress: { duration: 0.7, bounce: 0.15 },
  /** Toasts entering and leaving. */
  toast: { duration: 0.35, bounce: 0 },
  /** The rest of the stack moving into the space a toast gave up or took. */
  stack: { duration: 0.4, bounce: 0.1 },
  /** A list row appearing. */
  row: { duration: 0.35, bounce: 0 },
} as const;

export const VIEW_ENTER: AnimationTargets = { opacity: 0, y: 12 };
export const VIEW_EXIT: AnimationTargets = { opacity: 0, y: -8 };
export const TOAST_ENTER: AnimationTargets = { y: 16, opacity: 0, scale: 0.96 };
export const TOAST_EXIT: AnimationTargets = { opacity: 0, x: 24 };
export const ROW_ENTER: AnimationTargets = { opacity: 0, y: 10 };

/** The corner radius of a bill card and of its dialog; morph() holds it constant while the box scales. */
export const BILL_RADIUS_PX = 16;

// `?slow=6` stretches the morph so a screenshot can catch it in mid-flight.
export const BILL_MORPH: MorphOptions = { duration: 0.5 * DEBUG.slow, bounce: 0.1, radius: BILL_RADIUS_PX };
export const BACKDROP_SPRING = { duration: 0.4 * DEBUG.slow, bounce: 0 } as const;
export const BADGE_SPRING = { duration: 0.45, bounce: 0.45 } as const;

/** For motion damped does not own (counting numbers, staggered mounts); damped itself follows the setting by default. */
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
