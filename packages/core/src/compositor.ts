import {
  CONFIG,
  MIN_BLUR,
  commit,
  composeTransform,
  quiet,
  readProperty,
  runJs,
  valueFor,
  type AnimatableProperty,
  type ElementState,
  type Driver,
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
function runCompositor(element: Element, state: ElementState, jobs: Job[]): boolean {
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
  const start = performance.now();

  const release = (): Job[] => {
    if (state.run !== run) return [];
    state.run = undefined;
    // The animation itself knows best how far it got: it starts a frame or two after creation, when it is ready.
    const reported = animation.currentTime;
    const time = Math.max(0, typeof reported === "number" ? reported : performance.now() - start);
    quiet(state, () => {
      for (const job of jobs) {
        const current = time >= duration ? { position: job.to, velocity: 0 } : springs[job.property]!.at(time / 1000);
        seedSpringValue(valueFor(element, state, job.property), current.position, current.velocity);
      }
    });
    commit(element, state, groupsOf(jobs));
    detach(animation);
    animation.cancel();
    return jobs;
  };
  const run: Run = {
    jobs,
    release,
    releaseOwned(owns) {
      if (!jobs.some((job) => owns(job.property))) return;
      const kept: Job[] = [];
      for (const job of release()) {
        if (owns(job.property)) job.settle(false);
        else kept.push(job);
      }
      if (!runCompositor(element, state, kept)) for (const job of kept) runJs(element, state, job);
    },
  };
  state.run = run;

  animation.onfinish = () => {
    if (state.run !== run) return;
    state.run = undefined;
    detach(animation);
    // Inline styles first, so dropping the forwards fill below shows the same thing.
    land(element, state, jobs);
    animation.cancel();
  };
  animation.oncancel = () => {
    // Cancelled by someone else: keep where it got to rather than snapping back to the stale inline styles.
    if (state.run !== run) return;
    for (const job of release()) job.settle(false);
  };
  return true;
}

/** A transform, opacity or filter is animated by one driver at a time, so JS animations in a group the jobs use move over. */
function adoptJsJobs(state: ElementState, jobs: Job[]): void {
  const groups = groupsOf(jobs);
  for (const property of Object.keys(state.jobs) as AnimatableProperty[]) {
    const job = state.jobs[property]!;
    const value = state.values[property]!;
    // A value that was stopped, jumped or claimed this very tick has not reported yet; it must stay stopped.
    if (!groups.has(CONFIG[property].group) || !value.animating) continue;
    job.moved = true;
    delete state.jobs[property];
    quiet(state, () => seedSpringValue(value, value.get(), value.getVelocity()));
    jobs.push(job);
  }
}

/**
 * Plays an animation on the browser's compositor thread through the Web Animations API, so it keeps moving while the
 * main thread is busy. Pass it as `driver` to animate(). Without WAAPI, or for a spring that never settles, animate()
 * falls back to the JS driver.
 */
export const compositor: Driver = {
  supports: (element) => typeof (element as Partial<Element>).animate === "function",
  play(element, state, jobs) {
    adoptJsJobs(state, jobs);
    return runCompositor(element, state, jobs);
  },
};
