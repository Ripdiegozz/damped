import type { AnimationTargets } from "damped";

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
  /** A list row appearing. */
  row: { duration: 0.35, bounce: 0 },
} as const;

export const VIEW_ENTER: AnimationTargets = { opacity: 0, y: 12 };
export const VIEW_EXIT: AnimationTargets = { opacity: 0, y: -8 };
export const ROW_ENTER: AnimationTargets = { opacity: 0, y: 10 };

/** For motion damped does not own (counting numbers, staggered mounts); damped itself follows the setting by default. */
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
