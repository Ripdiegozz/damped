import { animate, peekSpringValue, type AnimatableProperty, type AnimationControls } from "./animate";
import {
  AXES,
  REST,
  deltas,
  installCorrections,
  measureLayout,
  resolveChildren,
  validateLayoutOptions,
  type Deltas,
  type LayoutOptions,
} from "./layout";
import { frame } from "./scheduler";
import type { SpringOptions } from "./spring";

/*
 * morph() is two FLIPs against each other's boxes, built from the layout internals: `to` starts on the box of `from`
 * and settles at its own, `from` travels onto the box of `to`. Both are driven through animate() values, so a morph
 * that interrupts the opposite one only retargets them and keeps position and velocity.
 *
 * Besides what layout() assumes, the two elements are expected to be visible and laid out at their final boxes when
 * morph() is called. While a morph runs it owns x, y, scaleX, scaleY, opacity (unless crossfade is off) and the blur
 * of the corrected children of both elements.
 */

export type MorphOptions = LayoutOptions & {
  /** Fade `to` in and `from` out. Default true. */
  crossfade?: boolean;
  /** Blur radius in px applied to the content children during the morph (incoming: blur → 0, outgoing: 0 → blur). Default 8; 0 disables. */
  blur?: number;
};

export interface MorphControls {
  /** true if this morph settled; false if a later morph/stop on either element superseded it. Never rejects. */
  readonly finished: Promise<boolean>;
  stop(): void;
}

const DEFAULT_BLUR = 8;
// Same as the default of the perceptual spring options in spring.ts.
const DEFAULT_DURATION = 0.5;
// The incoming fade is this much faster, so the combined opacity of the two elements never dips mid-morph.
const INCOMING_FADE_SPEEDUP = 2;

interface MorphState {
  superseded: boolean;
  stopped: boolean;
  touched: [Element, AnimatableProperty][];
}

// The latest morph that claimed each element.
const owners = new WeakMap<Element, MorphState>();

// Checked on the values rather than on a promise, so a morph that settled in this very frame is not reported as cut.
const running = (state: MorphState): boolean =>
  state.touched.some(([element, property]) => peekSpringValue(element, property)?.animating === true);

// Critically damped (bounce 0) fades. Physical spring options have no duration to scale: both fades use that spring,
// which may overshoot, and opacity is clamped by the browser.
function fadeSprings(spring: SpringOptions): { incoming: SpringOptions; outgoing: SpringOptions } {
  if ("stiffness" in spring) {
    const { stiffness, damping, mass } = spring;
    const physical = { stiffness, damping, ...(mass === undefined ? {} : { mass }) };
    return { incoming: physical, outgoing: physical };
  }
  const duration = spring.duration ?? DEFAULT_DURATION;
  return {
    incoming: { duration: duration / INCOMING_FADE_SPEEDUP, bounce: 0 },
    outgoing: { duration, bounce: 0 },
  };
}

export function morph(from: HTMLElement, to: HTMLElement, options: MorphOptions = {}): MorphControls {
  const { crossfade = true, blur = DEFAULT_BLUR, correct = "children", radius, ...animateOptions } = options;
  if (from === to) throw new TypeError("morph() needs two different elements");
  validateLayoutOptions(options);
  if (!(Number.isFinite(blur) && blur >= 0)) {
    throw new RangeError(`blur must be a finite number greater than or equal to 0, received ${blur}`);
  }

  const scheduler = animateOptions.scheduler ?? frame;
  const { reducedMotion } = animateOptions;
  const common = { scheduler, ...(reducedMotion === undefined ? {} : { reducedMotion }) };
  const fades = fadeSprings(animateOptions as SpringOptions);
  const fromBox = measureLayout(from);
  const toBox = measureLayout(to);

  const state: MorphState = { superseded: false, stopped: false, touched: [] };
  const controls: AnimationControls[] = [];
  for (const element of [from, to]) {
    const previous = owners.get(element);
    if (previous !== undefined && running(previous)) previous.superseded = true;
    owners.set(element, state);
  }

  const run = (element: HTMLElement, incoming: boolean, target: Deltas, start: Deltas | undefined): void => {
    // Values that are moving belong to an interrupted opposite morph: retarget them and keep their velocity.
    const fresh = !AXES.some((axis) => peekSpringValue(element, axis)?.animating === true);
    const jump = fresh && incoming && start !== undefined;
    // An explicit list belongs to whichever element contains each entry.
    const scoped = correct === "children" ? correct : correct.filter((child) => child !== element && element.contains(child));
    const fade = incoming ? fades.incoming : fades.outgoing;
    const track = (elements: readonly Element[], property: AnimatableProperty): void => {
      for (const tracked of elements) state.touched.push([tracked, property]);
    };

    installCorrections(element, scheduler, scoped, radius);
    controls.push(animate(element, target, { ...animateOptions, scheduler, ...(jump ? { from: start } : {}) }));
    for (const axis of AXES) track([element], axis);

    if (crossfade) {
      controls.push(animate(element, { opacity: incoming ? 1 : 0 }, { ...common, ...fade, ...(jump ? { from: { opacity: 0 } } : {}) }));
      track([element], "opacity");
    }
    if (blur > 0) {
      const children = resolveChildren(element, scoped);
      controls.push(animate(children, { blur: incoming ? 0 : blur }, { ...common, ...fade, ...(jump ? { from: { blur } } : {}) }));
      track(children, "blur");
    }
  };

  run(to, true, REST, deltas(fromBox, toBox));
  run(from, false, deltas(toBox, fromBox), undefined);

  return {
    finished: Promise.all(controls.map((entry) => entry.finished)).then(() => !state.superseded && !state.stopped),
    stop() {
      if (running(state)) state.stopped = true;
      for (const entry of controls) entry.stop();
    },
  };
}
