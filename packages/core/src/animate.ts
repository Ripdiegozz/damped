import { canUseCompositor, release, releaseOwned, runCompositor } from "./compositor";
import {
  CONFIG,
  commit,
  existingState,
  quiet,
  runJs,
  stateFor,
  valueFor,
  type AnimatableProperty,
  type ElementState,
  type Group,
  type Job,
  type RenderHook,
} from "./element";
import { frame, type Scheduler } from "./scheduler";
import { springParams, type SpringOptions } from "./spring";
import { seedSpringValue, type SpringValue } from "./value";

export type { AnimatableProperty } from "./element";
export { IDENTITY_TRANSFORM } from "./element";
export type AnimationTargets = Partial<Record<AnimatableProperty, number>>;
export type AnimateOptions = SpringOptions & {
  scheduler?: Scheduler;
  /** `"user"` (default) follows `prefers-reduced-motion`. */
  reducedMotion?: "user" | "always" | "never";
  /** Applied immediately, as a jump, before animating. */
  from?: AnimationTargets;
  /**
   * What plays the animation. `"js"` (default) writes styles from the frame loop. `"compositor"` hands the sampled
   * spring to the browser's compositor through the Web Animations API, so it keeps moving while the main thread is
   * busy; without WAAPI, or for a spring that never settles, it falls back to `"js"`.
   */
  driver?: "js" | "compositor";
};
// Omit applied per union member, so both spring option forms (perceptual and physical) survive.
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface AnimationControls {
  /** Resolves when every property set by this call has settled or been superseded. Never rejects. */
  readonly finished: Promise<void>;
  /** Freezes the properties that this call still owns; properties retargeted by a newer call are left alone. */
  stop(): void;
}

/*
 * damped owns the inline `transform` of every element it animates (replacing any existing one),
 * `opacity` once opacity is animated, and `filter` once blur is animated.
 */

export function entries(targets: AnimationTargets | undefined, label: string): [AnimatableProperty, number][] {
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

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface Claim {
  element: Element;
  state: ElementState;
  value: SpringValue;
  property: AnimatableProperty;
}

export function animate(
  target: Element | readonly Element[],
  values: AnimationTargets,
  options: AnimateOptions = {},
): AnimationControls {
  const { scheduler = frame, reducedMotion = "user", from, driver = "js", ...rest } = options;
  if (driver !== "js" && driver !== "compositor") throw new TypeError(`animate: unknown driver "${String(driver)}"`);
  const springOptions = rest as SpringOptions;
  const targets = entries(values, "animate");
  const starts = entries(from, "animate from");
  // Validate spring options before touching any element so a bad option never leaves a call half-applied.
  springParams(springOptions);
  const reduced = targets.length > 0 && prefersReducedMotion(reducedMotion);

  const token = {};
  // A property may appear twice (once from `from`, once from `values`); stopping it twice is harmless.
  const claims: Claim[] = [];
  const waits: Promise<void>[] = [];

  for (const element of toList(target)) {
    const state = stateFor(element, scheduler);
    // A compositor animation still running here is taken down at its exact state; what this call does not claim goes on.
    const carried = release(element, state);
    const compositor = driver === "compositor" && canUseCompositor(element);
    const claimed = new Set<AnimatableProperty>();
    // Groups changed by jumps, which no animation covers and which therefore need an inline write of their own.
    const jumped = new Set<Group>();
    const jobs: Job[] = [];

    const claim = (property: AnimatableProperty): SpringValue => {
      const value = valueFor(element, state, property);
      state.owners[property] = token;
      claims.push({ element, state, value, property });
      claimed.add(property);
      return value;
    };
    const jump = (property: AnimatableProperty, to: number): void => {
      const value = claim(property);
      if (!compositor) {
        value.jump(to);
        return;
      }
      quiet(state, () => value.jump(to));
      jumped.add(CONFIG[property].group);
    };

    for (const [property, start] of starts) jump(property, start);
    for (const [property, end] of targets) {
      if (reduced && CONFIG[property].spatial) {
        jump(property, end);
        continue;
      }
      const value = claim(property);
      const wait = deferred();
      waits.push(wait.promise);
      const { restDelta, restSpeed } = CONFIG[property];
      const job: Job = {
        property,
        to: end,
        config: { restDelta, restSpeed, ...springOptions },
        settle: () => wait.resolve(),
        moved: false,
      };
      if (!compositor) {
        runJs(element, state, job);
        continue;
      }
      // Stops a JS animation of this property; the compositor continues from its position and velocity.
      quiet(state, () => seedSpringValue(value, value.get(), value.getVelocity()));
      jobs.push(job);
    }

    for (const job of carried) {
      if (claimed.has(job.property)) job.settle(false);
      else if (compositor) jobs.push(job);
      else runJs(element, state, job);
    }
    if (!compositor) continue;

    // A transform, opacity or filter is animated by one driver at a time, so JS animations in the same group move over.
    const groups = new Set(jobs.map((job) => CONFIG[job.property].group));
    for (const property of Object.keys(state.jobs) as AnimatableProperty[]) {
      const job = state.jobs[property]!;
      const value = state.values[property]!;
      // A value that was stopped or jumped this very tick has not reported yet; it must stay stopped.
      if (claimed.has(property) || !groups.has(CONFIG[property].group) || !value.animating) continue;
      job.moved = true;
      delete state.jobs[property];
      quiet(state, () => seedSpringValue(value, value.get(), value.getVelocity()));
      jobs.push(job);
    }
    commit(element, state, jumped);
    if (!runCompositor(element, state, jobs)) for (const job of jobs) runJs(element, state, job);
  }

  return {
    finished: Promise.all(waits).then(() => undefined),
    stop() {
      // Properties taken over by a newer call keep animating; `finished` still resolves through their superseded jobs.
      for (const { element, state, value, property } of claims) {
        if (state.owners[property] !== token) continue;
        releaseOwned(element, state, (other) => state.owners[other] === token);
        value.stop();
      }
    },
  };
}

/** The value `property` has when it is not animated: what enter() animates to by default. */
export function identityValue(property: AnimatableProperty): number {
  return CONFIG[property].initial;
}

/*
 * Internal accessors for layout.ts and presence.ts. They are deliberately not re-exported from index.ts.
 */

/** The element's value for `property`, created (and the element's scheduler fixed) on first use. */
export function springValueFor(element: Element, scheduler: Scheduler, property: AnimatableProperty): SpringValue {
  return valueFor(element, stateFor(element, scheduler), property);
}

/** The element's existing value for `property`, if animate() or layout ever created one. */
export function peekSpringValue(element: Element, property: AnimatableProperty): SpringValue | undefined {
  return existingState(element)?.values[property];
}

/** Installs (or with `undefined` removes) the hook that runs inside every transform write of `element`. */
export function setRenderHook(element: Element, scheduler: Scheduler, hook: RenderHook | undefined): void {
  stateFor(element, scheduler).renderHook = hook;
}

export { releaseToJs } from "./compositor";
