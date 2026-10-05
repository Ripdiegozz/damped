import { afterEach, describe, expect, test } from "bun:test";
import { createScheduler, type Phase, type Scheduler } from "../src/scheduler";
import { createSpring, type SpringOptions } from "../src/spring";
import { createSpringValue, type SpringValueOptions } from "../src/value";
import { createFakeSource } from "./fake-frame-source";

const SPRING: SpringOptions = { duration: 0.5, bounce: 0.15 };

function setup(options: SpringValueOptions = {}, initial = 0) {
  const fake = createFakeSource();
  const scheduler = createScheduler(fake.source);
  const value = createSpringValue(initial, { scheduler, ...options });
  return { fake, scheduler, value };
}

function flushAll(fake: ReturnType<typeof createFakeSource>, from: number, step = 16, limit = 2000): number {
  let timestamp = from;
  for (let i = 0; i < limit && fake.pending > 0; i++) {
    fake.flush(timestamp);
    timestamp += step;
  }
  return timestamp;
}

describe("idle", () => {
  test("a new value reports its initial state and requests no frame", () => {
    const { fake, scheduler, value } = setup({}, 7);
    expect(value.get()).toBe(7);
    expect(value.getVelocity()).toBe(0);
    expect(value.animating).toBe(false);
    expect(scheduler.active).toBe(false);
    expect(fake.requests).toBe(0);
  });

  test("a non-finite initial value throws RangeError", () => {
    expect(() => createSpringValue(Number.NaN)).toThrow(RangeError);
    expect(() => createSpringValue(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("animating", () => {
  test("set() registers exactly one loop job in the update phase, even when retargeted", () => {
    const fake = createFakeSource();
    const inner = createScheduler(fake.source);
    const loops: Phase[] = [];
    const scheduler: Scheduler = {
      schedule: (phase, job) => inner.schedule(phase, job),
      loop(phase, job) {
        loops.push(phase);
        return inner.loop(phase, job);
      },
      get active() {
        return inner.active;
      },
    };
    const value = createSpringValue(0, { scheduler });
    void value.set(100);
    expect(value.animating).toBe(true);
    expect(fake.requests).toBe(1);
    fake.flush(0);
    fake.flush(16);
    void value.set(50);
    void value.set(75);
    expect(loops).toEqual(["update"]);
    expect(fake.pending).toBe(1);
  });

  test("the first frame yields the start state and later frames follow the spring", () => {
    const { fake, value } = setup();
    void value.set(100, SPRING);
    fake.flush(1000);
    expect(value.get()).toBe(0);
    expect(value.getVelocity()).toBe(0);

    const spring = createSpring(0, 100, 0, SPRING);
    fake.flush(1016);
    expect(value.get()).toBe(spring.at(0.016).position);
    expect(value.getVelocity()).toBe(spring.at(0.016).velocity);
    fake.flush(1100);
    expect(value.get()).toBe(spring.at(0.1).position);
    expect(value.getVelocity()).toBe(spring.at(0.1).velocity);
  });

  test("a value started on a later wake takes its start from that frame, not from the first animation", () => {
    const { fake, value } = setup();
    void value.set(10, SPRING);
    flushAll(fake, 0);
    void value.set(20, SPRING);
    fake.flush(90_000);
    expect(value.get()).toBe(10);
    fake.flush(90_016);
    expect(value.get()).toBe(createSpring(10, 20, 0, SPRING).at(0.016).position);
  });

  test("settling snaps to the target, zeroes velocity, resolves true and leaves the scheduler idle", async () => {
    const { fake, scheduler, value } = setup();
    const seen: [number, number][] = [];
    value.onChange((position, velocity) => seen.push([position, velocity]));
    const settled = value.set(100, SPRING);
    flushAll(fake, 0);
    expect(await settled).toBe(true);
    expect(value.get()).toBe(100);
    expect(value.getVelocity()).toBe(0);
    expect(value.animating).toBe(false);
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
    expect(seen.at(-1)).toEqual([100, 0]);
    expect(seen.length).toBeGreaterThan(3);
  });

  test("the frame that settles notifies once and the next wake does not repeat it", () => {
    const { fake, value } = setup();
    let notifications = 0;
    value.onChange(() => notifications++);
    void value.set(100, SPRING);
    flushAll(fake, 0);
    const total = notifications;
    expect(fake.pending).toBe(0);
    expect(notifications).toBe(total);
  });

  test("per-call spring options select the spring", () => {
    const { fake, value } = setup();
    const options: SpringOptions = { stiffness: 400, damping: 12, mass: 2 };
    void value.set(100, options);
    fake.flush(0);
    fake.flush(50);
    expect(value.get()).toBe(createSpring(0, 100, 0, options).at(0.05).position);
  });

  test("restDelta and restSpeed defaults are forwarded to every spring", async () => {
    const { fake, value } = setup({ restDelta: 200, restSpeed: 1e6 });
    const settled = value.set(100, SPRING);
    fake.flush(0);
    expect(value.get()).toBe(100);
    expect(await settled).toBe(true);
    expect(fake.pending).toBe(0);
  });

  test("per-call rest thresholds override the value defaults", () => {
    const { fake, value } = setup({ restDelta: 200, restSpeed: 1e6 });
    void value.set(100, { ...SPRING, restDelta: 0.001, restSpeed: 0.01 });
    fake.flush(0);
    expect(value.get()).toBe(0);
    expect(value.animating).toBe(true);
  });

  test("an overshooting spring passes the target before settling on it", () => {
    const { fake, value } = setup();
    let peak = 0;
    value.onChange((position) => (peak = Math.max(peak, position)));
    void value.set(100, { duration: 0.5, bounce: 0.5 });
    flushAll(fake, 0);
    expect(peak).toBeGreaterThan(100);
    expect(value.get()).toBe(100);
  });

  test("set() rejects a non-finite target synchronously and leaves the value untouched", () => {
    const { fake, value } = setup({}, 3);
    expect(() => value.set(Number.NaN)).toThrow(RangeError);
    expect(() => value.set(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => value.jump(Number.NaN)).toThrow(RangeError);
    expect(value.get()).toBe(3);
    expect(value.animating).toBe(false);
    expect(fake.requests).toBe(0);
  });
});

describe("retargeting", () => {
  // Drives a value to a point where it moves fast, then returns it with the last timestamp.
  function midFlight() {
    const context = setup();
    void context.value.set(100, SPRING);
    let timestamp = 1000;
    for (let i = 0; i < 6; i++) {
      context.fake.flush(timestamp);
      timestamp += 16;
    }
    return { ...context, last: timestamp - 16 };
  }

  test("the new spring keeps the last position and velocity", () => {
    const { value } = midFlight();
    const position = value.get();
    const velocity = value.getVelocity();
    expect(velocity).toBeGreaterThan(100);
    void value.set(40, SPRING);
    expect(value.get()).toBe(position);
    expect(value.getVelocity()).toBe(velocity);
  });

  test("the next frame advances by a real delta from the frame that produced the state", () => {
    const { fake, value, last } = midFlight();
    const position = value.get();
    const velocity = value.getVelocity();
    void value.set(40, SPRING);
    fake.flush(last + 16);
    const expected = createSpring(position, 40, velocity, SPRING).at(0.016);
    expect(value.get()).toBe(expected.position);
    expect(value.getVelocity()).toBe(expected.velocity);
  });

  test("motion is continuous across the retarget", () => {
    const { fake, value, last } = midFlight();
    const before = value.get();
    // The step produced by the frame just before the retarget.
    const stepBefore = before - createSpring(0, 100, 0, SPRING).at((last - 16 - 1000) / 1000).position;
    void value.set(40, SPRING);
    fake.flush(last + 16);
    const stepAfter = value.get() - before;
    expect(Math.sign(stepAfter)).toBe(Math.sign(stepBefore));
    expect(Math.abs(stepAfter)).toBeGreaterThanOrEqual(Math.abs(stepBefore) / 2);
  });

  test("a retarget issued before the first frame runs still starts at that first frame", () => {
    const { fake, value } = setup();
    void value.set(100, SPRING);
    void value.set(50, SPRING);
    fake.flush(500);
    expect(value.get()).toBe(0);
    fake.flush(516);
    expect(value.get()).toBe(createSpring(0, 50, 0, SPRING).at(0.016).position);
  });

  test("an earlier set() resolves false and the latest one resolves true", async () => {
    const { fake, value } = setup();
    const first = value.set(100, SPRING);
    fake.flush(0);
    fake.flush(16);
    const second = value.set(0, SPRING);
    flushAll(fake, 32);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(value.get()).toBe(0);
  });

  test("retargeting from a change listener replaces the spring without the old one settling", async () => {
    const { fake, value } = setup();
    let retargeted: Promise<boolean> | undefined;
    const first = value.set(100, SPRING);
    value.onChange((position) => {
      if (position > 20 && retargeted === undefined) retargeted = value.set(-50, SPRING);
    });
    flushAll(fake, 0);
    expect(await first).toBe(false);
    expect(await retargeted).toBe(true);
    expect(value.get()).toBe(-50);
  });

  test("set() from a listener on the settling frame starts a fresh animation", async () => {
    const { fake, value } = setup();
    let again: Promise<boolean> | undefined;
    const first = value.set(10, SPRING);
    value.onChange((position, velocity) => {
      if (position === 10 && velocity === 0 && again === undefined) again = value.set(20, SPRING);
    });
    flushAll(fake, 0);
    expect(await first).toBe(true);
    expect(await again).toBe(true);
    expect(value.get()).toBe(20);
    expect(fake.pending).toBe(0);
  });
});

describe("jump and stop", () => {
  test("jump() sets the value with zero velocity, cancels the animation and notifies", async () => {
    const { fake, scheduler, value } = setup();
    const pending = value.set(100, SPRING);
    fake.flush(0);
    fake.flush(50);
    expect(value.getVelocity()).not.toBe(0);
    const seen: [number, number][] = [];
    value.onChange((position, velocity) => seen.push([position, velocity]));
    value.jump(5);
    expect(value.get()).toBe(5);
    expect(value.getVelocity()).toBe(0);
    expect(value.animating).toBe(false);
    expect(scheduler.active).toBe(false);
    expect(seen).toEqual([[5, 0]]);
    expect(await pending).toBe(false);
  });

  test("jump() on an idle value notifies and requests no frame", () => {
    const { fake, value } = setup();
    const seen: number[] = [];
    value.onChange((position) => seen.push(position));
    value.jump(9);
    expect(seen).toEqual([9]);
    expect(fake.requests).toBe(0);
  });

  test("stop() freezes at the current value without notifying and resolves false", async () => {
    const { fake, scheduler, value } = setup();
    const pending = value.set(100, SPRING);
    fake.flush(0);
    fake.flush(50);
    const frozen = value.get();
    let notifications = 0;
    value.onChange(() => notifications++);
    value.stop();
    expect(value.get()).toBe(frozen);
    expect(value.getVelocity()).toBe(0);
    expect(value.animating).toBe(false);
    expect(scheduler.active).toBe(false);
    expect(notifications).toBe(0);
    expect(await pending).toBe(false);
    expect(fake.pending).toBe(0);
  });

  test("stop() on an idle value is a no-op", () => {
    const { fake, value } = setup({}, 4);
    value.stop();
    expect(value.get()).toBe(4);
    expect(fake.requests).toBe(0);
  });

  test("a value can be animated again after stop() and after jump()", async () => {
    const { fake, value } = setup();
    void value.set(100, SPRING);
    fake.flush(0);
    fake.flush(50);
    value.stop();
    const stopped = value.get();
    const afterStop = value.set(200, SPRING);
    flushAll(fake, 1000);
    expect(await afterStop).toBe(true);
    expect(value.get()).toBe(200);
    expect(stopped).toBeLessThan(200);

    value.jump(0);
    const afterJump = value.set(1, SPRING);
    flushAll(fake, 5000);
    expect(await afterJump).toBe(true);
    expect(value.get()).toBe(1);
  });
});

describe("same target", () => {
  test("set() at the settled target resolves true without requesting a frame", async () => {
    const { fake, value } = setup({}, 12);
    expect(await value.set(12, SPRING)).toBe(true);
    expect(fake.requests).toBe(0);
    expect(value.animating).toBe(false);
  });

  test("set() back to the target after settling resolves true without requesting a frame", async () => {
    const { fake, value } = setup();
    void value.set(30, SPRING);
    flushAll(fake, 0);
    const requests = fake.requests;
    expect(await value.set(30, SPRING)).toBe(true);
    expect(fake.requests).toBe(requests);
  });

  test("a stopped value away from the target animates on set()", async () => {
    const { fake, value } = setup();
    void value.set(100, SPRING);
    fake.flush(0);
    fake.flush(50);
    value.stop();
    const pending = value.set(100, SPRING);
    expect(value.animating).toBe(true);
    flushAll(fake, 100);
    expect(await pending).toBe(true);
  });

  test("the same target while animating retargets and supersedes the earlier set()", async () => {
    const { fake, value } = setup();
    const first = value.set(100, SPRING);
    fake.flush(0);
    fake.flush(16);
    const second = value.set(100, SPRING);
    flushAll(fake, 32);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
  });
});

describe("listeners", () => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  afterEach(() => {
    globalThis.queueMicrotask = originalQueueMicrotask;
  });

  function stubMicrotasks() {
    const queued: (() => void)[] = [];
    globalThis.queueMicrotask = (callback) => {
      queued.push(callback);
    };
    return queued;
  }

  test("receive the position and velocity of every frame, in subscription order", () => {
    const { fake, value } = setup();
    const log: string[] = [];
    value.onChange((position, velocity) => log.push(`a:${position}:${velocity}`));
    value.onChange((position) => log.push(`b:${position}`));
    void value.set(100, SPRING);
    fake.flush(0);
    fake.flush(16);
    const at = createSpring(0, 100, 0, SPRING).at(0.016);
    expect(log).toEqual(["a:0:0", "b:0", `a:${at.position}:${at.velocity}`, `b:${at.position}`]);
  });

  test("the returned function unsubscribes, idempotently", () => {
    const { fake, value } = setup();
    let calls = 0;
    const unsubscribe = value.onChange(() => calls++);
    void value.set(100, SPRING);
    fake.flush(0);
    expect(calls).toBe(1);
    unsubscribe();
    unsubscribe();
    fake.flush(16);
    expect(calls).toBe(1);
  });

  test("a listener may unsubscribe itself while being notified", () => {
    const { fake, value } = setup();
    const log: string[] = [];
    const stopFirst = value.onChange(() => {
      log.push("first");
      stopFirst();
    });
    value.onChange(() => log.push("second"));
    void value.set(100, SPRING);
    fake.flush(0);
    fake.flush(16);
    expect(log).toEqual(["first", "second", "second"]);
  });

  test("a throwing listener neither breaks the value nor starves other listeners", async () => {
    const { fake, value } = setup();
    const queued = stubMicrotasks();
    const error = new Error("listener failed");
    const seen: number[] = [];
    value.onChange(() => {
      throw error;
    });
    value.onChange((position) => seen.push(position));
    const settled = value.set(100, SPRING);
    expect(() => flushAll(fake, 0)).not.toThrow();
    expect(await settled).toBe(true);
    expect(value.get()).toBe(100);
    expect(seen.at(-1)).toBe(100);
    expect(queued.length).toBe(seen.length);
    expect(() => queued[0]!()).toThrow(error);
  });

  test("a listener that throws during jump() does not stop jump()", () => {
    const { value } = setup();
    const queued = stubMicrotasks();
    value.onChange(() => {
      throw new Error("boom");
    });
    expect(() => value.jump(3)).not.toThrow();
    expect(value.get()).toBe(3);
    expect(queued).toHaveLength(1);
  });
});
