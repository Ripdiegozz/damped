import type { Scheduler } from "./scheduler";
import type { Spring, SpringOptions } from "./spring";
import { createSpringValue, type SpringValue } from "./value";

/*
 * Per-element animation state shared by animate() and the compositor driver: the SpringValues, who owns each
 * property, and the single place that turns values into inline styles.
 */

export type AnimatableProperty = "x" | "y" | "scale" | "scaleX" | "scaleY" | "rotate" | "opacity" | "blur";

export type Group = "transform" | "opacity" | "filter";

interface PropertyConfig {
  group: Group;
  initial: number;
  /** Moves in space and therefore jumps under reduced motion. */
  spatial: boolean;
  restDelta: number;
  restSpeed: number;
}

// Rest thresholds per unit: settling within 0.01 px (or degree) and 0.1 px/s is below what a display can show,
// while unitless ratios (scale, opacity) need finer thresholds because their whole range is about 0..1.
const LENGTH = { restDelta: 0.01, restSpeed: 0.1 };
const ANGLE = { restDelta: 0.01, restSpeed: 0.1 };
const RATIO = { restDelta: 0.0005, restSpeed: 0.005 };

export const CONFIG: Record<AnimatableProperty, PropertyConfig> = {
  x: { group: "transform", initial: 0, spatial: true, ...LENGTH },
  y: { group: "transform", initial: 0, spatial: true, ...LENGTH },
  rotate: { group: "transform", initial: 0, spatial: true, ...ANGLE },
  scale: { group: "transform", initial: 1, spatial: true, ...RATIO },
  scaleX: { group: "transform", initial: 1, spatial: true, ...RATIO },
  scaleY: { group: "transform", initial: 1, spatial: true, ...RATIO },
  opacity: { group: "opacity", initial: 1, spatial: false, ...RATIO },
  blur: { group: "filter", initial: 0, spatial: false, ...LENGTH },
};

// Below this radius a blur is invisible, so the filter is cleared instead of kept as a compositor layer.
export const MIN_BLUR = 0.01;

export type RenderHook = (scaleX: number, scaleY: number) => void;

/** One property's animation as requested by an animate() call, whichever driver runs it. */
export interface Job {
  property: AnimatableProperty;
  to: number;
  /** Spring options including the rest thresholds, so the same spring can be rebuilt from any later state. */
  config: SpringOptions;
  /** Settles the wait of the call that created the job: true once at rest, false when superseded or stopped. */
  settle(settled: boolean): void;
  /** Set once the job continues under another driver, so the abandoned driver no longer reports for it. */
  moved: boolean;
}

/** A WAAPI animation that animates the jobs of one element. */
export interface Run {
  animation: Animation;
  /** performance.now() when the animation was created; the fallback timeline when the animation reports none. */
  start: number;
  /** Milliseconds. */
  duration: number;
  springs: Partial<Record<AnimatableProperty, Spring>>;
  jobs: Job[];
}

export interface ElementState {
  // The scheduler of the first animate() call on an element drives it from then on.
  scheduler: Scheduler;
  values: Partial<Record<AnimatableProperty, SpringValue>>;
  // Token of the animate() call that last targeted each property.
  owners: Partial<Record<AnimatableProperty, object>>;
  /** Jobs running on SpringValues (the JS driver). */
  jobs: Partial<Record<AnimatableProperty, Job>>;
  /** The compositor animation of this element, if any. */
  run: Run | undefined;
  /** While true, value changes do not queue writes: the caller commits the styles itself. */
  muted: boolean;
  dirty: Record<Group, boolean>;
  writeQueued: boolean;
  // Runs inside the transform write with the effective scale, so extra per-element writes share the single write job.
  renderHook: RenderHook | undefined;
}

/** Transform written for an element whose animated transform values are all at rest. */
export const IDENTITY_TRANSFORM = "translate3d(0px, 0px, 0) rotate(0deg) scale(1, 1)";

const states = new WeakMap<Element, ElementState>();

export function stateFor(element: Element, scheduler: Scheduler): ElementState {
  let state = states.get(element);
  if (state === undefined) {
    state = {
      scheduler,
      values: {},
      owners: {},
      jobs: {},
      run: undefined,
      muted: false,
      dirty: { transform: false, opacity: false, filter: false },
      writeQueued: false,
      renderHook: undefined,
    };
    states.set(element, state);
  }
  return state;
}

export function existingState(element: Element): ElementState | undefined {
  return states.get(element);
}

export function readProperty(state: ElementState, property: AnimatableProperty): number {
  return state.values[property]?.get() ?? CONFIG[property].initial;
}

/** The inline transform for the given values, with the effective per-axis scale that corrections need. */
export function composeTransform(read: (property: AnimatableProperty) => number) {
  const scale = read("scale");
  const scaleX = scale * read("scaleX");
  const scaleY = scale * read("scaleY");
  const transform = `translate3d(${read("x")}px, ${read("y")}px, 0) rotate(${read("rotate")}deg) scale(${scaleX}, ${scaleY})`;
  return { transform, scaleX, scaleY };
}

function writeStyles(element: Element, state: ElementState): void {
  const style = (element as Partial<ElementCSSInlineStyle>).style;
  if (style === undefined) return;
  const read = (property: AnimatableProperty): number => readProperty(state, property);

  if (state.dirty.transform) {
    state.dirty.transform = false;
    const { transform, scaleX, scaleY } = composeTransform(read);
    style.transform = transform;
    state.renderHook?.(scaleX, scaleY);
  }
  if (state.dirty.opacity) {
    state.dirty.opacity = false;
    style.opacity = String(read("opacity"));
  }
  if (state.dirty.filter) {
    state.dirty.filter = false;
    const blur = read("blur");
    style.filter = blur > MIN_BLUR ? `blur(${blur}px)` : "";
  }
}

function render(element: Element, state: ElementState): void {
  state.writeQueued = false;
  writeStyles(element, state);
}

/** Writes the given groups inline right now, outside the frame loop. */
export function commit(element: Element, state: ElementState, groups: Iterable<Group>): void {
  for (const group of groups) state.dirty[group] = true;
  writeStyles(element, state);
}

/** Runs `change` without queueing writes for the value changes it causes. */
export function quiet(state: ElementState, change: () => void): void {
  const was = state.muted;
  state.muted = true;
  try {
    change();
  } finally {
    state.muted = was;
  }
}

function markDirty(element: Element, state: ElementState, group: Group): void {
  if (state.muted) return;
  state.dirty[group] = true;
  if (state.writeQueued) return;
  state.writeQueued = true;
  // Called from the update phase, so the write phase of the same frame picks it up.
  state.scheduler.schedule("write", () => render(element, state));
}

function initialValue(element: Element, property: AnimatableProperty): number {
  if (property !== "opacity") return CONFIG[property].initial;
  if (typeof getComputedStyle !== "function") return 1;
  const opacity = Number.parseFloat(getComputedStyle(element).opacity);
  return Number.isFinite(opacity) ? opacity : 1;
}

export function valueFor(element: Element, state: ElementState, property: AnimatableProperty): SpringValue {
  let value = state.values[property];
  if (value === undefined) {
    value = createSpringValue(initialValue(element, property), { scheduler: state.scheduler });
    const group = CONFIG[property].group;
    value.onChange(() => markDirty(element, state, group));
    state.values[property] = value;
  }
  return value;
}

/** Runs a job on the property's SpringValue, i.e. through the frame scheduler. */
export function runJs(element: Element, state: ElementState, job: Job): void {
  const value = valueFor(element, state, job.property);
  state.jobs[job.property] = job;
  void value.set(job.to, job.config).then((settled) => {
    if (job.moved) return;
    if (state.jobs[job.property] === job) delete state.jobs[job.property];
    job.settle(settled);
  });
}
