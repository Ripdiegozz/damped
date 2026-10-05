import type { AnimationTargets } from "damped";

// One place for the spring feel of the shell, so every surface moves with the same character.
export const SPRINGS = {
  /** Sidebar and content area resizing. */
  panel: { duration: 0.45, bounce: 0.12 },
  /** The pill behind the active nav item. A little bounce makes a quick succession of clicks feel physical. */
  indicator: { duration: 0.4, bounce: 0.2 },
  /** Views entering and leaving. */
  view: { duration: 0.3, bounce: 0 },
} as const;

export const VIEW_ENTER: AnimationTargets = { opacity: 0, y: 12 };
export const VIEW_EXIT: AnimationTargets = { opacity: 0, y: -8 };

/** For motion damped does not own (counting numbers, staggered mounts); damped itself follows the setting by default. */
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
