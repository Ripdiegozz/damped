import type { AnimationTargets } from "damped";

// Where things start and end. How they get there (the spring) comes from the motion settings below.
export const VIEW_ENTER: AnimationTargets = { opacity: 0, y: 12 };
export const VIEW_EXIT: AnimationTargets = { opacity: 0, y: -8 };
export const TOAST_ENTER: AnimationTargets = { y: 16, opacity: 0, scale: 0.96 };
export const TOAST_EXIT: AnimationTargets = { opacity: 0, x: 24 };
export const ROW_ENTER: AnimationTargets = { opacity: 0, y: 10 };
export const ACTIVITY_ROW_ENTER: AnimationTargets = { opacity: 0, y: -12 };
export const ACTIVITY_ROW_EXIT: AnimationTargets = { opacity: 0, x: 16 };
export const LAB_ENTER: AnimationTargets = { opacity: 0, y: 16, scale: 0.97 };
export const LAB_EXIT: AnimationTargets = { opacity: 0, y: 16 };

/** The corner radius of a bill card and of its dialog; morph() holds it constant while the box scales. */
export const BILL_RADIUS_PX = 16;

/** What the Spring lab changes. Every animation in the app derives its spring from these. */
export interface MotionSettings {
  /** The base duration in seconds; each role scales it. */
  duration: number;
  /** The base bounce, from 0 (no overshoot) up; roles that move add to it, fades ignore it. */
  bounce: number;
  /** Simulates the reduced-motion preference app-wide. */
  reducedMotion: boolean;
  /** Stretches every duration by SLOW_MOTION_FACTOR. */
  slowMotion: boolean;
}

export const DEFAULT_MOTION: MotionSettings = { duration: 0.5, bounce: 0.1, reducedMotion: false, slowMotion: false };
export const DURATION_RANGE = { min: 0.1, max: 2, step: 0.05 } as const;
export const BOUNCE_RANGE = { min: 0, max: 0.6, step: 0.05 } as const;
export const SLOW_MOTION_FACTOR = 4;

interface RoleConfig {
  /** Share of the base duration. */
  scale: number;
  /** Added to the base bounce; null for motion that must not overshoot (fades, counting numbers). */
  bounce: number | null;
  /** Rest thresholds, where the defaults of the property would crawl. */
  rest?: { restDelta: number; restSpeed: number };
}

const ROLES = {
  /** Sidebar and content area resizing. */
  panel: { scale: 0.9, bounce: 0.02 },
  /** The pill behind the active nav item. A little more bounce makes a quick succession of clicks feel physical. */
  indicator: { scale: 0.8, bounce: 0.1 },
  /** A card turning into its dialog. */
  morph: { scale: 1, bounce: 0 },
  /** Views, rows and toasts entering and leaving: opacity and a short offset, no overshoot. */
  view: { scale: 0.6, bounce: null },
  row: { scale: 0.7, bounce: null },
  toast: { scale: 0.7, bounce: null },
  /** The dim layer behind a dialog. */
  backdrop: { scale: 0.8, bounce: null },
  /** Neighbours moving into the space a row or toast gave up or took. */
  stack: { scale: 0.8, bounce: 0 },
  /** The savings bar. */
  progress: { scale: 1.4, bounce: 0.05 },
  /** The check badge on a paid bill. */
  badge: { scale: 0.9, bounce: 0.35 },
  /**
   * Figures counting to a new value: no bounce, so a currency amount never swings past its target. A spring decays
   * exponentially, and from 25,000 dollars away the last cents would crawl for seconds, so it counts as arrived once
   * it is within 25 cents and slower than 2 dollars a second.
   */
  number: { scale: 1.6, bounce: null, rest: { restDelta: 0.25, restSpeed: 2 } },
} as const satisfies Record<string, RoleConfig>;

export type MotionRole = keyof typeof ROLES;
export const MOTION_ROLES = Object.keys(ROLES) as MotionRole[];

export interface MotionSpring {
  duration: number;
  bounce: number;
  restDelta?: number;
  restSpeed?: number;
  /** Present, as "always", only while reduced motion is simulated; otherwise damped follows the system. */
  reducedMotion?: "always";
}

// A spring needs a bounce below 1; above this it would barely come to rest.
const MAX_BOUNCE = 0.9;

/**
 * The spring one surface of the app uses: the base duration and bounce, shaped by the role of the surface.
 * `extraSlow` is the factor of the `?slow` test flag, which multiplies on top of the slow-motion switch.
 */
export function springFor(settings: MotionSettings, role: MotionRole, extraSlow = 1): MotionSpring {
  const config: RoleConfig = ROLES[role];
  const slow = (settings.slowMotion ? SLOW_MOTION_FACTOR : 1) * extraSlow;
  const bounce = config.bounce === null ? 0 : Math.min(Math.max(settings.bounce + config.bounce, 0), MAX_BOUNCE);
  return {
    duration: Math.round(settings.duration * config.scale * slow * 1000) / 1000,
    bounce,
    ...config.rest,
    ...(settings.reducedMotion ? { reducedMotion: "always" as const } : {}),
  };
}

/** Whether motion should be reduced: the system asks for it, or the lab simulates it. */
export const effectiveReducedMotion = (settings: MotionSettings, systemPrefersReduced: boolean): boolean =>
  settings.reducedMotion || systemPrefersReduced;
