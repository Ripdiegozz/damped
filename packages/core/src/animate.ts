import { frame, type Scheduler } from "./scheduler";
import { springParams, type SpringOptions } from "./spring";
import { createSpringValue, type SpringValue } from "./value";

export type AnimatableProperty = "x" | "y" | "scale" | "scaleX" | "scaleY" | "rotate" | "opacity" | "blur";
export type AnimationTargets = Partial<Record<AnimatableProperty, number>>;
export type AnimateOptions = SpringOptions & {
  scheduler?: Scheduler;
  /** `"user"` (default) follows `prefers-reduced-motion`. */
  reducedMotion?: "user" | "always" | "never";
  /** Applied immediately, as a jump, before animating. */
  from?: AnimationTargets;
};
export interface AnimationControls {
  /** Resolves when every property set by this call has settled or been superseded. Never rejects. */
  readonly finished: Promise<void>;
  /** Freezes the properties that this call still owns; properties retargeted by a newer call are left alone. */
  stop(): void;
}

type Group = "transform" | "opacity" | "filter";

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

const CONFIG: Record<AnimatableProperty, PropertyConfig> = {
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
const MIN_BLUR = 0.01;

export type RenderHook = (scaleX: number, scaleY: number) => void;

interface ElementState {
  // The scheduler of the first animate() call on an element drives it from then on.
  scheduler: Scheduler;
  values: Partial<Record<AnimatableProperty, SpringValue>>;
  // Token of the animate() call that last targeted each property.
  owners: Partial<Record<AnimatableProperty, object>>;
  dirty: Record<Group, boolean>;
  writeQueued: boolean;
  // Runs inside the transform write with the effective scale, so extra per-element writes share the single write job.
  renderHook: RenderHook | undefined;
}

/*
 * damped owns the inline `transform` of every element it animates (replacing any existing one),
 * `opacity` once opacity is animated, and `filter` once blur is animated.
 */
/** Transform written for an element whose animated transform values are all at rest. */
export const IDENTITY_TRANSFORM = "translate3d(0px, 0px, 0) rotate(0deg) scale(1, 1)";

const states = new WeakMap<Element, ElementState>();

function stateFor(element: Element, scheduler: Scheduler): ElementState {
  let state = states.get(element);
  if (state === undefined) {
    state = {
      scheduler,
      values: {},
      owners: {},
      dirty: { transform: false, opacity: false, filter: false },
      writeQueued: false,
      renderHook: undefined,
    };
    states.set(element, state);
  }
  return state;
}

function render(element: Element, state: ElementState): void {
  state.writeQueued = false;
  const style = (element as Partial<ElementCSSInlineStyle>).style;
  if (style === undefined) return;
  const read = (property: AnimatableProperty): number => state.values[property]?.get() ?? CONFIG[property].initial;

  if (state.dirty.transform) {
    state.dirty.transform = false;
    const scale = read("scale");
    const scaleX = scale * read("scaleX");
    const scaleY = scale * read("scaleY");
    style.transform = `translate3d(${read("x")}px, ${read("y")}px, 0) rotate(${read("rotate")}deg) scale(${scaleX}, ${scaleY})`;
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

function markDirty(element: Element, state: ElementState, group: Group): void {
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

function valueFor(element: Element, state: ElementState, property: AnimatableProperty): SpringValue {
  let value = state.values[property];
  if (value === undefined) {
    value = createSpringValue(initialValue(element, property), { scheduler: state.scheduler });
    const group = CONFIG[property].group;
    value.onChange(() => markDirty(element, state, group));
    state.values[property] = value;
  }
  return value;
}

function entries(targets: AnimationTargets | undefined, label: string): [AnimatableProperty, number][] {
  const result: [AnimatableProperty, number][] = [];
  if (targets === undefined) return result;
  for (const [name, target] of Object.entries(targets)) {
    if (!Object.hasOwn(CONFIG, name)) throw new TypeError(`${label}: unknown animatable property "${name}"`);
    if (target === undefined) continue;
    if (typeof target !== "number" || !Number.isFinite(target)) {
      throw new RangeError(`${label}: "${name}" must be a finite number, received ${String(target)}`);
    }
    result.push([name as AnimatableProperty, target]);
  }
  return result;
}

function prefersReducedMotion(mode: "user" | "always" | "never"): boolean {
  if (mode !== "user") return mode === "always";
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function toList(target: Element | readonly Element[]): readonly Element[] {
  return Array.isArray(target) ? (target as readonly Element[]) : [target as Element];
}

export function animate(
  target: Element | readonly Element[],
  values: AnimationTargets,
  options: AnimateOptions = {},
): AnimationControls {
  const { scheduler = frame, reducedMotion = "user", from, ...rest } = options;
  const springOptions = rest as SpringOptions;
  const targets = entries(values, "animate");
  const starts = entries(from, "animate from");
  // Validate spring options before touching any element so a bad option never leaves a call half-applied.
  springParams(springOptions);
  const reduced = targets.length > 0 && prefersReducedMotion(reducedMotion);

  const token = {};
  // A property may appear twice (once from `from`, once from `values`); stopping it twice is harmless.
  const claims: { value: SpringValue; state: ElementState; property: AnimatableProperty }[] = [];
  const pending: Promise<boolean>[] = [];

  for (const element of toList(target)) {
    const state = stateFor(element, scheduler);
    const claim = (property: AnimatableProperty): SpringValue => {
      const value = valueFor(element, state, property);
      state.owners[property] = token;
      claims.push({ value, state, property });
      return value;
    };

    for (const [property, start] of starts) claim(property).jump(start);
    for (const [property, end] of targets) {
      const value = claim(property);
      if (reduced && CONFIG[property].spatial) {
        value.jump(end);
      } else {
        const { restDelta, restSpeed } = CONFIG[property];
        pending.push(value.set(end, { restDelta, restSpeed, ...springOptions }));
      }
    }
  }

  return {
    finished: Promise.all(pending).then(() => undefined),
    stop() {
      // Properties taken over by a newer call keep animating; `finished` still resolves through their superseded set().
      for (const { value, state, property } of claims) {
        if (state.owners[property] === token) value.stop();
      }
    },
  };
}

/*
 * Internal accessors for layout.ts. They are deliberately not re-exported from index.ts.
 */

/** The element's value for `property`, created (and the element's scheduler fixed) on first use. */
export function springValueFor(element: Element, scheduler: Scheduler, property: AnimatableProperty): SpringValue {
  return valueFor(element, stateFor(element, scheduler), property);
}

/** The element's existing value for `property`, if animate() or layout ever created one. */
export function peekSpringValue(element: Element, property: AnimatableProperty): SpringValue | undefined {
  return states.get(element)?.values[property];
}

/** Installs (or with `undefined` removes) the hook that runs inside every transform write of `element`. */
export function setRenderHook(element: Element, scheduler: Scheduler, hook: RenderHook | undefined): void {
  stateFor(element, scheduler).renderHook = hook;
}
