import { afterEach, describe, expect, test } from "bun:test";
import { compositor as compositorDriver } from "../src/compositor";
import { animate, peekSpringValue, type AnimateOptions, type AnimationTargets } from "../src/animate";
import { layout, snapshot } from "../src/layout";
import { morph } from "../src/morph";
import { enter } from "../src/presence";
import { createScheduler } from "../src/scheduler";
import { createSpring, type SpringOptions } from "../src/spring";
import { A, B, C, IDENTITY, createWorld, setup as setupLayout } from "./layout-world";
import { createFakeSource } from "./fake-frame-source";

const SPRING = { duration: 0.5, bounce: 0.15 } as const;
const LEN = { ...SPRING, restDelta: 0.01, restSpeed: 0.1 };
const RATIO = { ...SPRING, restDelta: 0.0005, restSpeed: 0.005 };
// 120 Hz in milliseconds: the keyframe step of the compositor driver.
const STEP = 1000 / 120;
const originalMatchMedia = globalThis.matchMedia;
const originalNow = performance.now;

afterEach(() => {
  globalThis.matchMedia = originalMatchMedia;
  performance.now = originalNow;
});

interface Frame {
  offset: number;
  transform?: string;
  opacity?: string;
  filter?: string;
}

// Stands in for a WAAPI Animation: records what the driver asked for and exposes the playback position as a knob.
class FakeAnimation {
  currentTime: number | null;
  onfinish: (() => void) | null = null;
  oncancel: (() => void) | null = null;
  cancels = 0;
  // Inline styles at the moment cancel() ran: they must already hold the committed state, or the element would flash.
  atCancel: { transform: string; opacity: string; filter: string } | undefined;

  constructor(
    private readonly element: HTMLElement,
    readonly keyframes: Frame[],
    readonly options: KeyframeAnimationOptions,
    currentTime: number | null,
  ) {
    this.currentTime = currentTime;
  }

  cancel(): void {
    this.cancels++;
    const { transform, opacity, filter } = this.element.style;
    this.atCancel = { transform, opacity, filter };
    // Like a browser, the cancel event arrives later; the driver must have detached its handler by then.
    queueMicrotask(() => this.oncancel?.());
  }

  /** Plays to the end, as the browser does when the timeline reaches the duration. */
  finish(): void {
    this.currentTime = Number(this.options.duration);
    this.onfinish?.();
  }
}

function stubAnimate(element: HTMLElement, currentTime: number | null = 0): FakeAnimation[] {
  const animations: FakeAnimation[] = [];
  Object.defineProperty(element, "animate", {
    configurable: true,
    value: (keyframes: Frame[], options: KeyframeAnimationOptions) => {
      const animation = new FakeAnimation(element, keyframes, options, currentTime);
      animations.push(animation);
      return animation;
    },
  });
  return animations;
}

function setup() {
  const fake = createFakeSource();
  const scheduler = createScheduler(fake.source);
  const js = (extra: Partial<AnimateOptions> = {}): AnimateOptions => ({ ...SPRING, scheduler, ...extra });
  const compositor = (extra: Partial<AnimateOptions> = {}): AnimateOptions => js({ driver: compositorDriver, ...extra });
  return { fake, scheduler, js, compositor };
}

function createElement(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

function stage(currentTime: number | null = 0) {
  const element = createElement();
  return { element, animations: stubAnimate(element, currentTime), ...setup() };
}

function transform(x: number, y = 0, rotate = 0, scaleX = 1, scaleY = 1): string {
  return `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`;
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function watch(promise: Promise<unknown>) {
  const state = { done: false };
  void promise.then(() => {
    state.done = true;
  });
  return state;
}

function lastOf<T>(list: readonly T[]): T {
  return list[list.length - 1]!;
}

// The analytic state of a spring at a playback position in milliseconds.
const at = (spring: ReturnType<typeof createSpring>, milliseconds: number) => spring.at(milliseconds / 1000);

describe("sampling", () => {
  test("the keyframes are the composed styles of the analytic springs at a 120 Hz step, ending exactly on the targets", () => {
    const { element, animations, compositor } = stage();
    animate(element, { x: 300, opacity: 0.25, blur: 8 }, compositor());

    expect(animations).toHaveLength(1);
    const { keyframes, options } = animations[0]!;
    const x = createSpring(0, 300, 0, LEN);
    const opacity = createSpring(1, 0.25, 0, RATIO);
    const blur = createSpring(0, 8, 0, LEN);
    const settle = Math.max(x.settleTime(), opacity.settleTime(), blur.settleTime());

    expect(options).toEqual({ duration: settle * 1000, easing: "linear", fill: "forwards" });
    expect(settle * 1000).toBeLessThan(3000);
    const count = Math.ceil((settle * 1000) / STEP);
    expect(keyframes).toHaveLength(count + 1);

    for (let index = 0; index < count; index++) {
      const time = index * STEP;
      const radius = at(blur, time).position;
      expect(keyframes[index]).toEqual({
        offset: time / (settle * 1000),
        transform: transform(at(x, time).position),
        opacity: String(at(opacity, time).position),
        filter: radius > 0.01 ? `blur(${radius}px)` : "none",
      });
    }
    expect(keyframes[0]).toEqual({ offset: 0, transform: transform(0), opacity: "1", filter: "none" });
    expect(lastOf(keyframes)).toEqual({ offset: 1, transform: transform(300), opacity: "0.25", filter: "blur(8px)" });
  });

  test("only the groups that are animated appear in the keyframes, and the rest of the transform keeps its values", async () => {
    const { element, animations, compositor, js, fake } = stage();
    animate(element, { y: 50, rotate: 10 }, js());
    for (let timestamp = 0; fake.pending > 0 && timestamp < 5000; timestamp += 16) fake.flush(timestamp);
    expect(element.style.transform).toBe(transform(0, 50, 10));

    animate(element, { scaleX: 2 }, compositor());
    const { keyframes } = animations[0]!;
    expect(keyframes.every((frame) => !("opacity" in frame) && !("filter" in frame))).toBe(true);
    expect(keyframes[0]!.transform).toBe(transform(0, 50, 10, 1, 1));
    expect(lastOf(keyframes).transform).toBe(transform(0, 50, 10, 2, 1));
  });

  test("a long settle is capped at 360 intervals instead of one keyframe per frame", () => {
    const { element, animations, compositor } = stage();
    const options = { stiffness: 5, damping: 1 };
    animate(element, { x: 100 }, compositor(options as Partial<AnimateOptions>));

    const spring = createSpring(0, 100, 0, { ...options, restDelta: 0.01, restSpeed: 0.1 });
    const duration = spring.settleTime() * 1000;
    expect(duration).toBeGreaterThan(3000);
    const { keyframes } = animations[0]!;
    expect(keyframes).toHaveLength(361);
    const step = duration / 360;
    expect(keyframes[7]).toEqual({ offset: (7 * step) / duration, transform: transform(at(spring, 7 * step).position) });
    expect(lastOf(keyframes)).toEqual({ offset: 1, transform: transform(100) });
  });

  test("a spring that is already at rest on its target starts no animation and resolves", async () => {
    const { element, animations, compositor } = stage();
    const finished = watch(animate(element, { x: 0 }, compositor()).finished);
    await tick();
    expect(animations).toHaveLength(0);
    expect(finished.done).toBe(true);
  });

  test("a spring that never settles falls back to the JS driver", () => {
    const { element, animations, compositor, fake } = stage();
    animate(element, { x: 100 }, compositor({ stiffness: 100, damping: 0 } as Partial<AnimateOptions>));
    expect(animations).toHaveLength(0);
    expect(fake.pending).toBe(1);
  });

  test("jobs that moved over from the JS driver run on it again, and still report, when the compositor cannot take them", async () => {
    const { element, js, compositor, fake } = stage();
    const done = watch(animate(element, { y: 80 }, js()).finished);
    fake.flush(0);
    fake.flush(32);
    animate(element, { x: 100 }, compositor({ stiffness: 100, damping: 0 } as Partial<AnimateOptions>));
    for (let timestamp = 48; timestamp < 4000; timestamp += 16) fake.flush(timestamp);
    await tick();
    expect(done.done).toBe(true);
    expect(peekSpringValue(element, "y")!.get()).toBe(80);
  });

  test("each element gets its own animation", () => {
    const first = stage();
    const second = createElement();
    const secondAnimations = stubAnimate(second);
    animate([first.element, second], { x: 10 }, first.compositor());
    expect(first.animations).toHaveLength(1);
    expect(secondAnimations).toHaveLength(1);
  });

  test("a compositor animation requests no animation frame at all", async () => {
    const { element, animations, compositor, fake } = stage();
    const controls = animate(element, { x: 300, opacity: 0 }, compositor());
    animations[0]!.finish();
    await controls.finished;
    expect(fake.requests).toBe(0);
  });
});

describe("fallback", () => {
  test("without element.animate the result is identical to the JS driver", async () => {
    const plain = setup();
    const element = createElement();
    const reference = createElement();
    // happy-dom ships an Element.animate; hide it to stand in for an engine without the Web Animations API.
    Object.defineProperty(element, "animate", { configurable: true, value: undefined });
    expect(typeof (element as Partial<Element>).animate).not.toBe("function");

    const targets: AnimationTargets = { x: 120, y: -30, scale: 1.5, opacity: 0.4, blur: 5 };
    const fallback = animate(element, targets, plain.compositor());
    const expected = animate(reference, targets, plain.js());
    for (let timestamp = 0; plain.fake.pending > 0 && timestamp < 5000; timestamp += 16) plain.fake.flush(timestamp);
    await Promise.all([fallback.finished, expected.finished]);

    expect(element.style.transform).toBe(reference.style.transform);
    expect(element.style.opacity).toBe(reference.style.opacity);
    expect(element.style.filter).toBe(reference.style.filter);
    expect(element.style.transform).toBe(transform(120, -30, 0, 1.5, 1.5));
  });
});

describe("completion", () => {
  test("commits the final styles inline before cancelling, syncs the values and resolves finished", async () => {
    const { element, animations, compositor, fake } = stage();
    const controls = animate(element, { x: 300, opacity: 0.25, blur: 8 }, compositor());
    const finished = watch(controls.finished);
    await tick();
    expect(finished.done).toBe(false);

    animations[0]!.finish();
    const done = animations[0]!;
    expect(done.cancels).toBe(1);
    expect(done.atCancel).toEqual({ transform: transform(300), opacity: "0.25", filter: "blur(8px)" });
    expect(element.style.transform).toBe(transform(300));
    expect(element.style.opacity).toBe("0.25");
    expect(element.style.filter).toBe("blur(8px)");

    for (const [property, target] of [["x", 300], ["opacity", 0.25], ["blur", 8]] as const) {
      const value = peekSpringValue(element, property)!;
      expect(value.get()).toBe(target);
      expect(value.getVelocity()).toBe(0);
      expect(value.animating).toBe(false);
    }
    await tick();
    expect(finished.done).toBe(true);
    // The late cancel event of the browser must not touch anything.
    expect(fake.requests).toBe(0);
    expect(element.style.transform).toBe(transform(300));
  });

  test("the blur filter is cleared inline when the animation ends at no blur", () => {
    const { element, animations, compositor } = stage();
    animate(element, { blur: 6 }, compositor());
    animations[0]!.finish();
    animate(element, { blur: 0 }, compositor());
    animations[1]!.finish();
    expect(animations[1]!.atCancel!.filter).toBe("");
    expect(element.style.filter).toBe("");
  });

  test("a later JS animation continues from the synced final state", () => {
    const { element, animations, compositor, js, fake } = stage();
    animate(element, { x: 300 }, compositor());
    animations[0]!.finish();
    animate(element, { x: 0 }, js());
    fake.flush(0);
    fake.flush(16);
    expect(peekSpringValue(element, "x")!.get()).toBe(createSpring(300, 0, 0, LEN).at(0.016).position);
  });
});

describe("interruption", () => {
  function midFlight(extra: Partial<AnimateOptions> = {}) {
    const context = stage();
    const first = animate(context.element, { x: 300 }, context.compositor(extra));
    const spring = createSpring(0, 300, 0, LEN);
    const now = 200;
    context.animations[0]!.currentTime = now;
    return { ...context, first, spring, now, state: at(spring, now) };
  }

  test("compositor to compositor: the new animation starts from the analytic state with its velocity", () => {
    const { element, animations, compositor, state, now } = midFlight();
    expect(state.velocity).toBeGreaterThan(100);
    animate(element, { x: 0 }, compositor());

    const [old, next] = animations;
    expect(old!.cancels).toBe(1);
    expect(old!.atCancel!.transform).toBe(transform(state.position));
    expect(now).toBe(old!.currentTime as number);

    const resumed = createSpring(state.position, 0, state.velocity, LEN);
    const reset = createSpring(state.position, 0, 0, LEN);
    expect(next!.options.duration).toBe(resumed.settleTime() * 1000);
    for (const [index, frame] of next!.keyframes.slice(0, -1).entries()) {
      expect(frame.transform).toBe(transform(at(resumed, index * STEP).position));
    }
    expect(next!.keyframes[0]!.transform).toBe(transform(state.position));
    expect(lastOf(next!.keyframes).transform).toBe(transform(0));
    // Control: resetting the velocity yields a visibly different curve, so the inheritance above is not a tautology.
    expect(at(reset, 5 * STEP).position).not.toBeCloseTo(at(resumed, 5 * STEP).position, 1);
    expect(next!.keyframes[5]!.transform).not.toBe(transform(at(reset, 5 * STEP).position));
  });

  test("compositor to JS: the values receive the analytic position and velocity and continue from them", () => {
    const { element, animations, js, fake, state } = midFlight();
    animate(element, { x: 0 }, js());

    expect(animations[0]!.cancels).toBe(1);
    expect(animations[0]!.atCancel!.transform).toBe(transform(state.position));
    const value = peekSpringValue(element, "x")!;
    expect(value.get()).toBe(state.position);
    expect(value.getVelocity()).toBe(state.velocity);
    expect(value.animating).toBe(true);

    fake.flush(1000);
    fake.flush(1016);
    const resumed = createSpring(state.position, 0, state.velocity, LEN).at(0.016);
    const reset = createSpring(state.position, 0, 0, LEN).at(0.016);
    expect(value.get()).toBe(resumed.position);
    expect(value.get()).not.toBe(reset.position);
    expect(element.style.transform).toBe(transform(resumed.position));
  });

  test("JS to compositor: the animation starts from the SpringValue position and velocity", () => {
    const { element, animations, js, compositor, fake } = stage();
    animate(element, { x: 300 }, js());
    fake.flush(0);
    fake.flush(48);
    const value = peekSpringValue(element, "x")!;
    const position = value.get();
    const velocity = value.getVelocity();
    expect(velocity).toBeGreaterThan(0);

    animate(element, { x: 0 }, compositor());
    expect(value.animating).toBe(false);
    const resumed = createSpring(position, 0, velocity, LEN);
    expect(animations[0]!.keyframes[3]!.transform).toBe(transform(at(resumed, 3 * STEP).position));
  });

  test("the superseded call finishes when it is replaced, the new one when it settles", async () => {
    const { element, animations, first, compositor } = midFlight();
    const old = watch(first.finished);
    const next = watch(animate(element, { x: 0 }, compositor()).finished);
    await tick();
    expect(old.done).toBe(true);
    expect(next.done).toBe(false);
    animations[1]!.finish();
    await tick();
    expect(next.done).toBe(true);
  });

  test("a property the new call does not touch keeps animating in the new animation, with its velocity", async () => {
    const { element, animations, compositor } = stage();
    const old = animate(element, { x: 300, opacity: 0 }, compositor());
    animations[0]!.currentTime = 200;
    const opacity = at(createSpring(1, 0, 0, RATIO), 200);
    const oldDone = watch(old.finished);
    animate(element, { x: 0 }, compositor());

    const next = animations[1]!;
    const resumed = createSpring(opacity.position, 0, opacity.velocity, RATIO);
    expect(next.keyframes[0]!.opacity).toBe(String(opacity.position));
    expect(next.keyframes[4]!.opacity).toBe(String(at(resumed, 4 * STEP).position));
    expect(lastOf(next.keyframes).opacity).toBe("0");
    await tick();
    expect(oldDone.done).toBe(false);
    next.finish();
    await tick();
    expect(oldDone.done).toBe(true);
    expect(element.style.opacity).toBe("0");
    expect(element.style.transform).toBe(transform(0));
  });

  test("a JS animation of another property in the same group moves into the compositor animation", async () => {
    const { element, animations, js, compositor, fake } = stage();
    const jsDone = watch(animate(element, { y: 80 }, js()).finished);
    fake.flush(0);
    fake.flush(32);
    const y = peekSpringValue(element, "y")!;
    const position = y.get();
    const velocity = y.getVelocity();
    expect(velocity).toBeGreaterThan(0);

    animate(element, { x: 300 }, compositor());
    expect(y.animating).toBe(false);
    const resumed = createSpring(position, 80, velocity, LEN);
    expect(animations[0]!.keyframes[2]!.transform).toBe(transform(at(createSpring(0, 300, 0, LEN), 2 * STEP).position, at(resumed, 2 * STEP).position));
    expect(lastOf(animations[0]!.keyframes).transform).toBe(transform(300, 80));
    await tick();
    expect(jsDone.done).toBe(false);
    animations[0]!.finish();
    await tick();
    expect(jsDone.done).toBe(true);
    expect(fake.pending).toBe(0);
  });

  test("a stopped JS value is not resurrected by a following compositor animation in its group", () => {
    const { element, animations, js, compositor, fake } = stage();
    const controls = animate(element, { y: 80 }, js());
    fake.flush(0);
    fake.flush(32);
    controls.stop();
    const frozen = peekSpringValue(element, "y")!.get();
    animate(element, { x: 300 }, compositor());
    expect(animations[0]!.keyframes.every((frame) => frame.transform!.includes(`, ${frozen}px, 0)`))).toBe(true);
  });

  test("an animation cancelled from outside freezes at the analytic state and resolves", async () => {
    const { element, animations, first, state } = midFlight();
    const done = watch(first.finished);
    animations[0]!.oncancel!();
    expect(element.style.transform).toBe(transform(state.position));
    await tick();
    expect(done.done).toBe(true);
    expect(peekSpringValue(element, "x")!.get()).toBe(state.position);
  });

  test("without a playback position the clock since the start is used", () => {
    const { element, animations, compositor } = stage(null);
    performance.now = () => 1000;
    animate(element, { x: 300 }, compositor());
    performance.now = () => 1200;
    animate(element, { x: 0 }, compositor());
    expect(animations[0]!.atCancel!.transform).toBe(transform(at(createSpring(0, 300, 0, LEN), 200).position));
  });
});

describe("stop", () => {
  test("freezes at the analytic state: committed inline, cancelled, values at rest, finished resolved", async () => {
    const { element, animations, compositor } = stage();
    const controls = animate(element, { x: 300 }, compositor());
    const done = watch(controls.finished);
    animations[0]!.currentTime = 200;
    const state = at(createSpring(0, 300, 0, LEN), 200);

    controls.stop();
    expect(animations[0]!.cancels).toBe(1);
    expect(animations[0]!.atCancel!.transform).toBe(transform(state.position));
    expect(element.style.transform).toBe(transform(state.position));
    const value = peekSpringValue(element, "x")!;
    expect(value.get()).toBe(state.position);
    expect(value.getVelocity()).toBe(0);
    await tick();
    expect(done.done).toBe(true);
    expect(animations).toHaveLength(1);
  });

  test("only the properties this call still owns are frozen; the others keep animating", async () => {
    const { element, animations, compositor } = stage();
    const first = animate(element, { x: 300, opacity: 0 }, compositor());
    animations[0]!.currentTime = 200;
    const x200 = at(createSpring(0, 300, 0, LEN), 200);
    const opacity200 = at(createSpring(1, 0, 0, RATIO), 200);
    const second = animate(element, { x: 0 }, compositor());

    // 100 ms into the second animation, where x belongs to the second call and opacity still to the first.
    animations[1]!.currentTime = 100;
    const x100 = at(createSpring(x200.position, 0, x200.velocity, LEN), 100);
    const opacity100 = at(createSpring(opacity200.position, 0, opacity200.velocity, RATIO), 100);

    first.stop();
    expect(animations[1]!.cancels).toBe(1);
    expect(element.style.opacity).toBe(String(opacity100.position));
    expect(peekSpringValue(element, "opacity")!.getVelocity()).toBe(0);
    // x continues, from its analytic state and with its velocity, in a new animation that no longer animates opacity.
    const rest = animations[2]!;
    expect(rest.keyframes.every((frame) => !("opacity" in frame))).toBe(true);
    expect(rest.keyframes[0]).toEqual({ offset: 0, transform: transform(x100.position) });
    const resumed = createSpring(x100.position, 0, x100.velocity, LEN);
    expect(rest.keyframes[3]!.transform).toBe(transform(at(resumed, 3 * STEP).position));
    expect(lastOf(rest.keyframes).transform).toBe(transform(0));

    const done = watch(second.finished);
    await tick();
    expect(done.done).toBe(false);
    rest.finish();
    await tick();
    expect(done.done).toBe(true);
  });

  test("a call superseded by a JS animation does not freeze the property it lost", () => {
    const { element, animations, compositor, js, fake } = stage();
    const first = animate(element, { x: 300 }, compositor());
    animations[0]!.currentTime = 100;
    animate(element, { x: 0 }, js());
    fake.flush(0);
    first.stop();
    expect(peekSpringValue(element, "x")!.animating).toBe(true);
  });

  test("stopping twice or after completion changes nothing", () => {
    const { element, animations, compositor } = stage();
    const controls = animate(element, { x: 300 }, compositor());
    animations[0]!.finish();
    controls.stop();
    controls.stop();
    expect(element.style.transform).toBe(transform(300));
    expect(animations).toHaveLength(1);
  });
});

describe("reduced motion", () => {
  test("spatial properties jump and are committed, opacity still animates on the compositor", () => {
    const { element, animations, compositor } = stage();
    animate(element, { x: 100, opacity: 0.2 }, compositor({ reducedMotion: "always" }));
    expect(element.style.transform).toBe(transform(100));
    expect(animations).toHaveLength(1);
    const spring = createSpring(1, 0.2, 0, RATIO);
    expect(animations[0]!.options.duration).toBe(spring.settleTime() * 1000);
    expect(animations[0]!.keyframes.every((frame) => !("transform" in frame))).toBe(true);
    expect(animations[0]!.keyframes[3]!.opacity).toBe(String(at(spring, 3 * STEP).position));
  });

  test("with only spatial properties nothing is animated", async () => {
    const { element, animations, compositor } = stage();
    const done = watch(animate(element, { x: 100 }, compositor({ reducedMotion: "always" })).finished);
    await tick();
    expect(animations).toHaveLength(0);
    expect(element.style.transform).toBe(transform(100));
    expect(done.done).toBe(true);
  });

  test("a reduced-motion jump interrupts a running compositor animation", () => {
    const { element, animations, compositor } = stage();
    animate(element, { x: 300 }, compositor());
    animate(element, { x: 50 }, compositor({ reducedMotion: "always" }));
    expect(animations[0]!.cancels).toBe(1);
    expect(element.style.transform).toBe(transform(50));
    expect(animations).toHaveLength(1);
  });

  test("from jumps and is committed", () => {
    const { element, animations, compositor } = stage();
    animate(element, { opacity: 1 }, compositor({ from: { x: 40, opacity: 0 } }));
    expect(element.style.transform).toBe(transform(40));
    expect(animations[0]!.keyframes[0]!.opacity).toBe("0");
  });
});

describe("validation", () => {
  test("invalid input throws before anything is touched, including a running compositor animation", () => {
    const { element, animations, compositor } = stage();
    animate(element, { x: 300 }, compositor());
    animations[0]!.currentTime = 100;
    const bad: [AnimationTargets | Record<string, unknown>, Partial<AnimateOptions>, ErrorConstructor][] = [
      [{ nope: 1 }, {}, TypeError],
      [{ x: Number.NaN }, {}, RangeError],
      [{ x: 1 }, { duration: -1 }, RangeError],
      [{ x: 1 }, { driver: "gpu" as never }, TypeError],
      // The driver is a value to import, not a name.
      [{ x: 1 }, { driver: "compositor" as never }, TypeError],
      [{ x: 1 }, { driver: {} as never }, TypeError],
      [{ x: 1 }, { from: { y: Number.POSITIVE_INFINITY } }, RangeError],
    ];
    for (const [targets, options, error] of bad) {
      expect(() => animate(element, targets as AnimationTargets, compositor(options))).toThrow(error);
    }
    expect(animations).toHaveLength(1);
    expect(animations[0]!.cancels).toBe(0);
    expect(element.style.transform).toBe("");
  });
});

describe("layout, morph and presence handover", () => {
  function running() {
    const context = setupLayout();
    const compositor = (): AnimateOptions => ({ ...SPRING, scheduler: context.scheduler, driver: compositorDriver });
    const world = createWorld("a");
    const element = createElement();
    world.place(element, { a: A, b: B });
    const animations = stubAnimate(element);
    animate(element, { x: 300 }, compositor());
    animations[0]!.currentTime = 200;
    const state = at(createSpring(0, 300, 0, LEN), 200);
    return { ...context, compositor, world, element, animations, state };
  }

  test("snapshot() commits the analytic state and hands the velocity to the JS values before measuring", () => {
    const { element, animations, world, state } = running();
    snapshot(element);

    expect(animations[0]!.cancels).toBe(1);
    expect(animations[0]!.atCancel!.transform).toBe(transform(state.position));
    // The visual box was measured with the committed transform applied.
    expect(world.seen[0]).toBe(transform(state.position));
    const value = peekSpringValue(element, "x")!;
    expect(value.get()).toBe(state.position);
    expect(value.getVelocity()).toBe(state.velocity);
    expect(value.animating).toBe(true);
  });

  test("layout() starts the FLIP from where the compositor animation was and settles at the new layout", async () => {
    const { element, world, fake, options, state } = running();
    const controls = layout(element, () => (world.state = "b"), options());
    // The visual box is the old box moved by the animated x; the FLIP delta maps it onto the new box.
    const value = peekSpringValue(element, "x")!;
    const expectedStart = A.x + A.width / 2 + state.position - (B.x + B.width / 2);
    expect(value.get()).toBeCloseTo(expectedStart, 9);
    expect(value.getVelocity()).toBeCloseTo(state.velocity, 9);

    for (let timestamp = 0; fake.pending > 0 && timestamp < 5000; timestamp += 16) fake.flush(timestamp);
    await controls.finished;
    expect(element.style.transform).toBe(IDENTITY);
  });

  test("morph() takes over both elements, and an incoming one that was moving is retargeted instead of restarted", () => {
    const { world, options, compositor } = running();
    const from = createElement();
    const to = createElement();
    world.place(from, { a: A, b: A });
    world.place(to, { a: C, b: C });
    const fromAnimations = stubAnimate(from);
    const toAnimations = stubAnimate(to);
    animate(from, { x: 300 }, compositor());
    animate(to, { x: 300, opacity: 0 }, compositor());
    fromAnimations[0]!.currentTime = 200;
    toAnimations[0]!.currentTime = 100;
    const moving = at(createSpring(0, 300, 0, LEN), 100);

    morph(from, to, options());
    expect(fromAnimations[0]!.cancels).toBe(1);
    expect(toAnimations[0]!.cancels).toBe(1);
    expect(fromAnimations[0]!.atCancel!.transform).toBe(transform(at(createSpring(0, 300, 0, LEN), 200).position));
    expect(toAnimations[0]!.atCancel!.transform).toBe(transform(moving.position));
    // Had `to` been treated as fresh, it would have jumped to the start of the FLIP with no velocity.
    const x = peekSpringValue(to, "x")!;
    expect(x.get()).toBe(moving.position);
    expect(x.getVelocity()).toBe(moving.velocity);
  });

  test("enter() retargets a compositor animation instead of jumping to its from state", () => {
    const { element, animations, options, state } = running();
    enter(element, { x: 500 }, {}, options());
    expect(animations[0]!.cancels).toBe(1);
    const value = peekSpringValue(element, "x")!;
    expect(value.get()).toBe(state.position);
    expect(value.animating).toBe(true);
  });

  test("layout, morph and enter ignore the driver option", () => {
    const { world, options, fake } = running();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const animations = stubAnimate(element);
    const taken = snapshot(element);
    world.state = "b";
    taken.animate({ ...options(), driver: compositorDriver } as never);
    enter(element, { x: 10 }, {}, { ...options(), driver: compositorDriver } as never);
    expect(animations).toHaveLength(0);
    expect(fake.pending).toBe(1);
  });
});

describe("options", () => {
  test("the driver defaults to js and accepts js explicitly", () => {
    const { element, animations, js, fake } = stage();
    animate(element, { x: 100 }, js());
    animate(element, { x: 200 }, js({ driver: "js" }));
    expect(animations).toHaveLength(0);
    expect(fake.pending).toBe(1);
  });

  test("a spring option shared by both drivers produces the same curve", () => {
    const { element, animations, compositor } = stage();
    const spring: SpringOptions = { stiffness: 300, damping: 25, mass: 2 };
    animate(element, { x: 100 }, compositor(spring as Partial<AnimateOptions>));
    const analytic = createSpring(0, 100, 0, { ...spring, restDelta: 0.01, restSpeed: 0.1 });
    expect(animations[0]!.keyframes[5]!.transform).toBe(transform(at(analytic, 5 * STEP).position));
  });
});
