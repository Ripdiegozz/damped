import {
  CONFIG,
  MIN_BLUR,
  commit,
  composeTransform,
  existingState,
  quiet,
  readProperty,
  runJs,
  valueFor,
  type AnimatableProperty,
  type ElementState,
  type Group,
  type Job,
  type Run,
} from "./element";
import { createSpring, type Spring } from "./spring";
import { seedSpringValue } from "./value";

/*
 * The compositor driver plays an animation on the browser's compositor thread through WAAPI, so it keeps moving while
 * the main thread is busy. The springs are analytic, so they are sampled into keyframes of the composed styles at a
 * fixed step; the browser interpolates linearly between the samples. Because the springs stay known, the exact
 * position and velocity at any moment can be computed again when the animation is interrupted or stopped, and handed
 * to the next animation (of either driver).
 *
 * Between samples the browser draws a straight line through a curve, which deviates from the spring by at most
 * acceleration * step^2 / 8 (about 0.4 px for a 300 px move over 0.5 s). The state handed over on interruption is the
 * exact analytic one, so a handover can move the element by up to that amount.
 */

// 120 Hz in milliseconds. The chord error shrinks with the square of the step, so this is a quarter of what 60 Hz gives.
const STEP = 1000 / 120;
// Animations longer than this are sampled in MAX_INTERVALS equal (and therefore longer) intervals, so a keyframe list
// never exceeds MAX_INTERVALS + 1 = 361 entries. 3 s at 120 Hz is exactly 360 intervals, so the step is continuous there.
const LONG_ANIMATION = 3000;
const MAX_INTERVALS = 360;

export function canUseCompositor(element: Element): boolean {
  return typeof (element as Partial<Element>).animate === "function";
}

const groupsOf = (jobs: readonly Job[]): Set<Group> => new Set(jobs.map((job) => CONFIG[job.property].group));

function detach(animation: Animation): void {
  animation.onfinish = null;
  animation.oncancel = null;
}

function keyframe(offset: number, groups: ReadonlySet<Group>, read: (property: AnimatableProperty) => number): Keyframe {
  const frame: Keyframe = { offset };
  if (groups.has("transform")) frame.transform = composeTransform(read).transform;
  if (groups.has("opacity")) frame.opacity = String(read("opacity"));
  if (groups.has("filter")) {
    const blur = read("blur");
    // `none` rather than an empty string, which is not a valid keyframe value.
    frame.filter = blur > MIN_BLUR ? `blur(${blur}px)` : "none";
  }
  return frame;
}

/** Milliseconds of playback so far, as the browser draws it. */
function elapsed(run: Run): number {
  // The animation itself knows best: it starts a frame or two after creation, when the compositor is ready.
  const reported = run.animation.currentTime;
  return Math.max(0, typeof reported === "number" ? reported : performance.now() - run.start);
}

/** Writes the final values inline, syncs the values to them and settles the jobs. */
function land(element: Element, state: ElementState, jobs: readonly Job[]): void {
  quiet(state, () => {
    for (const job of jobs) valueFor(element, state, job.property).jump(job.to);
  });
  commit(element, state, groupsOf(jobs));
  for (const job of jobs) job.settle(true);
}

/**
 * Plays the jobs on the compositor, from the current state of their values. Returns false, having done nothing, when
 * they cannot be: a spring that never settles has no end for the animation to have.
 */
export function runCompositor(element: Element, state: ElementState, jobs: Job[]): boolean {
  if (jobs.length === 0) return true;
  const springs: Partial<Record<AnimatableProperty, Spring>> = {};
  let settle = 0;
  for (const job of jobs) {
    const value = valueFor(element, state, job.property);
    const spring = createSpring(value.get(), job.to, value.getVelocity(), job.config);
    springs[job.property] = spring;
    settle = Math.max(settle, spring.settleTime());
  }
  if (!Number.isFinite(settle)) return false;

  if (settle === 0) {
    land(element, state, jobs);
    return true;
  }

  const groups = groupsOf(jobs);
  const duration = settle * 1000;
  const step = duration > LONG_ANIMATION ? duration / MAX_INTERVALS : STEP;
  // The epsilon keeps an exact multiple of the step from producing an extra, zero-length interval.
  const intervals = Math.ceil(duration / step - 1e-9);
  const keyframes: Keyframe[] = [];
  for (let index = 0; index < intervals; index++) {
    const time = index * step;
    keyframes.push(
      keyframe(time / duration, groups, (property) => springs[property]?.at(time / 1000).position ?? readProperty(state, property)),
    );
  }
  const targets: Partial<Record<AnimatableProperty, number>> = {};
  for (const job of jobs) targets[job.property] = job.to;
  keyframes.push(keyframe(1, groups, (property) => targets[property] ?? readProperty(state, property)));

  const animation = element.animate(keyframes, { duration, easing: "linear", fill: "forwards" });
  const run: Run = { animation, start: performance.now(), duration, springs, jobs };
  state.run = run;

  animation.onfinish = () => {
    if (state.run !== run) return;
    state.run = undefined;
    detach(animation);
    // Inline styles first, so dropping the forwards fill below shows the same thing.
    land(element, state, run.jobs);
    animation.cancel();
  };
  animation.oncancel = () => {
    // Cancelled by someone else: keep where it got to rather than snapping back to the stale inline styles.
    if (state.run !== run) return;
    for (const job of release(element, state)) job.settle(false);
  };
  return true;
}

/**
 * Takes the compositor animation of the element down at the exact analytic state of this moment: the values are
 * seeded with its position and velocity, the composed styles are committed inline, then the animation is cancelled.
 * Returns the jobs that were still running, to be continued by whichever driver comes next.
 */
export function release(element: Element, state: ElementState): Job[] {
  const run = state.run;
  if (run === undefined) return [];
  state.run = undefined;
  const time = elapsed(run);
  quiet(state, () => {
    for (const job of run.jobs) {
      const current =
        time >= run.duration ? { position: job.to, velocity: 0 } : run.springs[job.property]!.at(time / 1000);
      seedSpringValue(valueFor(element, state, job.property), current.position, current.velocity);
    }
  });
  commit(element, state, groupsOf(run.jobs));
  detach(run.animation);
  run.animation.cancel();
  return run.jobs;
}

/** Freezes the jobs `owns` selects, at their exact current state; the other jobs of the animation keep going. */
export function releaseOwned(element: Element, state: ElementState, owns: (property: AnimatableProperty) => boolean): void {
  if (state.run?.jobs.some((job) => owns(job.property)) !== true) return;
  const kept: Job[] = [];
  for (const job of release(element, state)) {
    if (owns(job.property)) job.settle(false);
    else kept.push(job);
  }
  if (!runCompositor(element, state, kept)) for (const job of kept) runJs(element, state, job);
}

/** Moves a running compositor animation of the element onto the JS driver, losing neither position nor velocity. */
export function releaseToJs(element: Element): void {
  const state = existingState(element);
  if (state?.run === undefined) return;
  for (const job of release(element, state)) runJs(element, state, job);
}
