import {
  animate,
  IDENTITY_TRANSFORM,
  peekSpringValue,
  setRenderHook,
  springValueFor,
  toList,
  type AnimateOptions,
  type AnimationControls,
} from "./animate";
import { frame, type Scheduler } from "./scheduler";
import { springParams, type SpringOptions } from "./spring";

/*
 * Layout animations are FLIP expressed through animate(): the previous visual box is turned into x, y, scaleX and
 * scaleY deltas against the new natural box, applied to the same per-element values animate() uses, and animated back
 * to the identity. Velocity inheritance and interruption therefore come from SpringValue.
 *
 * Assumptions: the element is not rotated, its `scale` is 1, and its transform-origin is the center. While a layout
 * runs it owns x, y, scaleX and scaleY of that element; animating them elsewhere in the meantime is unsupported.
 */

/** A rectangle in viewport coordinates (left, top). */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Omit applied per union member, so both spring option forms (perceptual and physical) survive.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type LayoutOptions = DistributiveOmit<AnimateOptions, "from"> & {
  /** Children whose size must not distort while the parent scales; each gets scale(1/scaleX, 1/scaleY) with transform-origin 0 0. */
  correct?: readonly HTMLElement[] | "children";
  /** Border radius in px kept visually constant while the element scales (written as `${r/sx}px / ${r/sy}px`, and `${r}px` at rest). */
  radius?: number;
};

export interface LayoutSnapshot {
  /** Animates every recorded element from its recorded visual box to its current natural layout. */
  animate(options?: LayoutOptions): AnimationControls;
}

type Axis = "x" | "y" | "scaleX" | "scaleY";
type Deltas = Record<Axis, number>;

const AXES: readonly Axis[] = ["x", "y", "scaleX", "scaleY"];
const REST: Deltas = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
// Boxes that differ by less than this are the same layout: below what a display can show, like the length rest delta.
const PIXEL_EPSILON = 0.01;
// Inverse scales and radii divide by the scale; this keeps a transient scale near 0 from producing Infinity.
const MIN_SCALE = 1e-3;

const centerX = (box: Box): number => box.x + box.width / 2;
const centerY = (box: Box): number => box.y + box.height / 2;

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/** Natural layout box: measured with the element's inline transform temporarily cleared (restored in the same call). */
export function measureLayout(element: Element): Box {
  const style = (element as Partial<ElementCSSInlineStyle>).style;
  const inline = style?.transform ?? "";
  // An identity transform cannot change the box, so skipping it saves two style writes (and a layout invalidation).
  const clear = style !== undefined && inline !== "" && inline !== "none" && inline !== IDENTITY_TRANSFORM;
  if (clear) style.transform = "";
  try {
    return boxOf(element);
  } finally {
    if (clear) style.transform = inline;
  }
}

interface Recorded {
  element: Element;
  /** Box with the current transform applied. */
  visual: Box;
  /** Box without it, i.e. the reference size the recorded scales are relative to. */
  natural: Box;
  velocity: Deltas;
}

function record(element: Element): Recorded {
  const velocity = { ...REST };
  for (const axis of AXES) velocity[axis] = peekSpringValue(element, axis)?.getVelocity() ?? 0;
  return { element, visual: boxOf(element), natural: measureLayout(element), velocity };
}

function deltas(previous: Box, next: Box): Deltas {
  return {
    x: centerX(previous) - centerX(next),
    y: centerY(previous) - centerY(next),
    // A box without size on an axis cannot be scaled from.
    scaleX: next.width > 0 ? previous.width / next.width : 1,
    scaleY: next.height > 0 ? previous.height / next.height : 1,
  };
}

// Velocity of a scale is relative to the reference size, so a new reference size changes it.
function rescale(velocity: number, oldSize: number, newSize: number): number {
  return oldSize > 0 && newSize > 0 ? (velocity * oldSize) / newSize : 0;
}

function unchanged(previous: Box, next: Box): boolean {
  return (
    Math.abs(previous.x - next.x) <= PIXEL_EPSILON &&
    Math.abs(previous.y - next.y) <= PIXEL_EPSILON &&
    Math.abs(previous.width - next.width) <= PIXEL_EPSILON &&
    Math.abs(previous.height - next.height) <= PIXEL_EPSILON
  );
}

function resolveChildren(element: Element, correct: LayoutOptions["correct"]): HTMLElement[] {
  if (correct === undefined) return [];
  if (correct !== "children") return [...correct];
  return Array.from(element.children).filter((child): child is HTMLElement => "style" in child);
}

// What a layout temporarily changed on an element, kept across interruptions so rest can undo all of it.
interface Run {
  children: Set<HTMLElement>;
  radius: number | undefined;
  // Inline transform-origin to put back, captured before damped first pinned it.
  origins: Map<HTMLElement, string>;
}

const runs = new WeakMap<Element, Run>();

function runFor(element: Element): Run {
  let run = runs.get(element);
  if (run === undefined) {
    run = { children: new Set(), radius: undefined, origins: new Map() };
    runs.set(element, run);
  }
  return run;
}

// Pinned once per run: rewriting it every frame would invalidate style for nothing.
function pinOrigin(run: Run, element: HTMLElement, origin: string): void {
  if (run.origins.has(element)) return;
  run.origins.set(element, element.style.transformOrigin);
  element.style.transformOrigin = origin;
}

const safeScale = (scale: number): number => Math.max(Math.abs(scale), MIN_SCALE);

function validate(options: LayoutOptions): void {
  const { radius } = options;
  if (radius !== undefined && !(Number.isFinite(radius) && radius >= 0)) {
    throw new RangeError(`radius must be a finite number greater than or equal to 0, received ${radius}`);
  }
  springParams(options as SpringOptions);
}

function combine(controls: readonly AnimationControls[]): AnimationControls {
  return {
    finished: Promise.all(controls.map((entry) => entry.finished)).then(() => undefined),
    stop() {
      for (const entry of controls) entry.stop();
    },
  };
}

function animateRecorded(recorded: readonly Recorded[], options: LayoutOptions): AnimationControls {
  const { correct, radius, ...animateOptions } = options;
  const scheduler = animateOptions.scheduler ?? frame;
  const controls: AnimationControls[] = [];

  for (const { element, visual, natural, velocity } of recorded) {
    const next = measureLayout(element);
    const start = deltas(visual, next);
    const staleValues = AXES.some((axis) => {
      const value = peekSpringValue(element, axis);
      return value !== undefined && (value.animating || value.get() !== REST[axis]);
    });
    if (!staleValues && unchanged(visual, next)) continue;

    const carried: Deltas = {
      x: velocity.x,
      y: velocity.y,
      scaleX: rescale(velocity.scaleX, natural.width, next.width),
      scaleY: rescale(velocity.scaleY, natural.height, next.height),
    };
    const values = AXES.map((axis) => springValueFor(element, scheduler, axis));
    for (const [index, axis] of AXES.entries()) values[index]!.rebase(start[axis], carried[axis]);

    const state = runFor(element);
    for (const child of resolveChildren(element, correct)) state.children.add(child);
    if (radius !== undefined) state.radius = radius;
    setRenderHook(element, scheduler, (scaleX, scaleY) => {
      if (values.every((value) => !value.animating)) {
        finishRun(element, scheduler, state);
        return;
      }
      applyCorrections(element as HTMLElement, state, scaleX, scaleY);
    });

    controls.push(animate(element, REST, { ...animateOptions, scheduler }));
  }
  return combine(controls);
}

function applyCorrections(element: HTMLElement, state: Run, scaleX: number, scaleY: number): void {
  pinOrigin(state, element, "50% 50%");
  for (const child of state.children) {
    pinOrigin(state, child, "0 0");
    child.style.transform = `scale(${1 / safeScale(scaleX)}, ${1 / safeScale(scaleY)})`;
  }
  if (state.radius !== undefined) {
    element.style.borderRadius = `${state.radius / safeScale(scaleX)}px / ${state.radius / safeScale(scaleY)}px`;
  }
}

function finishRun(element: Element, scheduler: Scheduler, state: Run): void {
  for (const child of state.children) child.style.transform = "";
  for (const [target, origin] of state.origins) target.style.transformOrigin = origin;
  if (state.radius !== undefined) (element as HTMLElement).style.borderRadius = `${state.radius}px`;
  runs.delete(element);
  setRenderHook(element, scheduler, undefined);
}

/** Records the current visual box (transform included) and velocities of each target, before a DOM change. */
export function snapshot(target: Element | readonly Element[]): LayoutSnapshot {
  const recorded = toList(target).map(record);
  return {
    animate(options = {}) {
      validate(options);
      return animateRecorded(recorded, options);
    },
  };
}

/** snapshot → mutate() → animate from the previous boxes to the new layout. */
export function layout(target: Element | readonly Element[], mutate: () => void, options: LayoutOptions = {}): AnimationControls {
  validate(options);
  const taken = snapshot(target);
  mutate();
  return taken.animate(options);
}
