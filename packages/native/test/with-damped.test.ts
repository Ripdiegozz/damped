import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createSpring } from "../../core/src/spring";
import * as fake from "./fake-reanimated";
import { dampedParams, dampedState } from "../src/math";

mock.module("react-native-reanimated", () => ({
  defineAnimation: fake.defineAnimation,
  ReduceMotion: fake.ReduceMotion,
}));

const { withDamped } = await import("../src/index");

const { FakeSharedValue, ReduceMotion, runtime } = fake;

const animation = (value: unknown) => value as Record<string, any>;

// Steps a shared value at a fixed cadence until the animation finishes (or `limit` ms pass).
function run(sv: InstanceType<typeof FakeSharedValue>, from: number, cadence: number, limit = 10_000): number {
  let now = from;
  while (sv.running && now - from < limit) {
    now += cadence;
    sv.frame(now);
  }
  return now;
}

beforeEach(() => {
  runtime.kind = "ui";
  runtime.systemReduceMotion = false;
  fake.defineCalls.length = 0;
});

describe("withDamped", () => {
  test("settles exactly at toValue and calls the callback with true", () => {
    const calls: unknown[][] = [];
    const sv = new FakeSharedValue(0);
    sv.assign(withDamped(100, { duration: 0.5, bounce: 0.2 }, (...args) => calls.push(args)), 1000);

    run(sv, 1000, 16);

    expect(sv.value).toBe(100);
    expect(sv.animation?.velocity).toBe(0);
    expect(sv.animation?.finished).toBe(true);
    expect(calls).toEqual([[true]]);
  });

  test("follows the core spring exactly along the trajectory", () => {
    const options = { duration: 0.6, bounce: 0.35 };
    const spring = createSpring(0, 100, 0, options);
    const sv = new FakeSharedValue(0);
    sv.assign(withDamped(100, options), 5000);

    for (let elapsed = 16; elapsed < 500; elapsed += 16) {
      sv.frame(5000 + elapsed);
      const expected = spring.at(elapsed / 1000);
      expect(Math.abs(sv.value - expected.position)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(sv.animation?.velocity - expected.velocity)).toBeLessThanOrEqual(1e-9);
    }
  });

  test("is frame-rate independent: the same state at the same timestamp", () => {
    const options = { duration: 0.5, bounce: 0.3 };
    const checkpoints = [100, 200, 300, 400, 600];
    const cadences: number[][] = [
      Array.from({ length: 60 }, (_, i) => (i + 1) * 10), // 100 fps
      Array.from({ length: 30 }, (_, i) => (i + 1) * 20), // 50 fps
      [7, 31, 100, 133, 200, 290, 300, 399, 400, 555, 600], // jittery
      [100, 200, 300, 400, 600], // very long frames
    ];

    const states = cadences.map((times) => {
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100, options), 2000);
      const seen = new Map<number, { value: number; velocity: number }>();
      for (const elapsed of times) {
        sv.frame(2000 + elapsed);
        if (checkpoints.includes(elapsed)) seen.set(elapsed, { value: sv.value, velocity: sv.animation?.velocity });
      }
      return seen;
    });

    for (const elapsed of checkpoints) {
      const reference = states[0]!.get(elapsed)!;
      for (const seen of states.slice(1)) {
        expect(seen.get(elapsed)!.value).toBeCloseTo(reference.value, 12);
        expect(seen.get(elapsed)!.velocity).toBeCloseTo(reference.velocity, 12);
      }
    }
  });

  test("does not clamp a long frame the way a stepped integrator would", () => {
    const sv = new FakeSharedValue(0);
    sv.assign(withDamped(100, { duration: 0.5, bounce: 0 }), 0);
    sv.frame(2000); // a 2 s hitch, far beyond a 64 ms step clamp
    expect(sv.value).toBe(100);
    expect(sv.animation?.finished).toBe(true);
  });

  describe("reversal", () => {
    const options = { duration: 0.6, bounce: 0.25 };

    function reverseMidFlight() {
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100, options), 0);
      for (let now = 16; now <= 112; now += 16) sv.frame(now);
      const previous = sv.animation!;
      const reversalValue = sv.value;
      const reversalVelocity = previous.velocity as number;
      return { sv, previous, reversalValue, reversalVelocity, reversalTime: 112 };
    }

    test("keeps the velocity of the running animation and continues in its direction", () => {
      const { sv, reversalValue, reversalVelocity, reversalTime } = reverseMidFlight();
      expect(reversalVelocity).toBeGreaterThan(0);
      expect(reversalValue).toBeGreaterThan(0);

      sv.assign(withDamped(0, options), reversalTime);
      const next = sv.animation!;

      // Seeded from the previous animation, not clipped: it still points away from the new target.
      expect(next.velocity).toBe(reversalVelocity);
      expect(sv.value).toBe(reversalValue);

      sv.frame(reversalTime + 16);
      const params = dampedParams(options);
      const expected = dampedState(reversalValue - 0, reversalVelocity, params, 0.016);
      expect(sv.value).toBeCloseTo(expected.position, 9);
      expect(sv.value).toBeGreaterThan(reversalValue);
    });

    test("differs from Reanimated's clipping, which would zero the velocity", () => {
      const { sv, reversalValue, reversalVelocity, reversalTime } = reverseMidFlight();
      sv.assign(withDamped(0, options), reversalTime);
      sv.frame(reversalTime + 16);

      // What Reanimated 4.5.1 does on retarget: velocity pointing away from toValue becomes 0.
      const clipped = dampedState(reversalValue, 0, dampedParams(options), 0.016);
      expect(clipped.position).toBeLessThan(reversalValue);
      expect(sv.value).toBeGreaterThan(reversalValue);
      expect(sv.value - clipped.position).toBeGreaterThan(reversalVelocity * 0.016 * 0.5);
    });

    test("eventually turns around and settles at the new target", () => {
      const { sv, reversalValue, reversalTime } = reverseMidFlight();
      sv.assign(withDamped(0, options), reversalTime);
      let peak = reversalValue;
      let now = reversalTime;
      while (sv.running && now < 20_000) {
        now += 16;
        sv.frame(now);
        peak = Math.max(peak, sv.value);
      }
      expect(peak).toBeGreaterThan(reversalValue);
      expect(sv.value).toBe(0);
    });

    test("cancels the interrupted animation with callback(false)", () => {
      const calls: unknown[][] = [];
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100, options, (...args) => calls.push(args)), 0);
      sv.frame(16);
      sv.assign(withDamped(0, options), 32);
      expect(calls).toEqual([[false]]);
    });

    test("a velocity option does not override a running animation's velocity", () => {
      const { sv, reversalVelocity, reversalTime } = reverseMidFlight();
      sv.assign(withDamped(0, { ...options, velocity: -5000 }), reversalTime);
      expect(sv.animation?.velocity).toBe(reversalVelocity);
    });
  });

  describe("without a running animation", () => {
    test("starts from rest when there is no previous animation and no velocity option", () => {
      const sv = new FakeSharedValue(10);
      sv.assign(withDamped(60), 0);
      expect(sv.animation?.velocity).toBe(0);
      sv.frame(16);
      const expected = dampedState(10 - 60, 0, dampedParams(), 0.016);
      expect(sv.value).toBeCloseTo(60 + expected.position, 12);
    });

    test("seeds the velocity option when there is no previous animation", () => {
      const options = { duration: 0.5, bounce: 0.1, velocity: 800 };
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100, options), 0);
      expect(sv.animation?.velocity).toBe(800);
      sv.frame(16);
      const expected = dampedState(-100, 800, dampedParams(options), 0.016);
      expect(sv.value).toBeCloseTo(100 + expected.position, 12);
    });

    test("uses the velocity option after the previous animation has finished", () => {
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100), 0);
      run(sv, 0, 16);
      expect(sv.animation?.finished).toBe(true);

      sv.assign(withDamped(0, { velocity: 400 }), 5000);
      expect(sv.animation?.velocity).toBe(400);
    });

    test("ignores a previous animation that has no velocity", () => {
      const sv = new FakeSharedValue(0);
      const timing = { current: 1, onStart: () => {}, onFrame: () => true };
      sv.assign(timing as never, 0);
      sv.assign(withDamped(50, { velocity: 120 }), 10);
      expect(sv.animation?.velocity).toBe(120);
    });

    test("finishes immediately when started at the target without velocity", () => {
      const calls: unknown[][] = [];
      const sv = new FakeSharedValue(100);
      sv.assign(withDamped(100, undefined, (...args) => calls.push(args)), 0);
      expect(calls).toEqual([[true]]);
    });
  });

  describe("overdamped springs", () => {
    test("bounce below zero approaches the target without overshoot and matches the core", () => {
      const options = { duration: 0.5, bounce: -0.5 };
      const spring = createSpring(0, 100, 0, options);
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100, options), 0);

      let previous = sv.value;
      for (let now = 16; now < 30_000 && sv.running; now += 16) {
        sv.frame(now);
        expect(sv.value).toBeGreaterThanOrEqual(previous);
        expect(sv.value).toBeLessThanOrEqual(100);
        // The frame that detects rest snaps to the target, so only running frames are comparable.
        if (sv.running) expect(Math.abs(sv.value - spring.at(now / 1000).position)).toBeLessThanOrEqual(1e-9);
        previous = sv.value;
      }
      expect(sv.value).toBe(100);
    });

    test("physical options with a large damping ratio settle slower than a critical spring", () => {
      const slow = new FakeSharedValue(0);
      slow.assign(withDamped(100, { stiffness: 100, damping: 200 }), 0);
      const critical = new FakeSharedValue(0);
      critical.assign(withDamped(100, { stiffness: 100, damping: 20 }), 0);

      const slowEnd = run(slow, 0, 16, 60_000);
      const criticalEnd = run(critical, 0, 16, 60_000);

      expect(slow.value).toBe(100);
      expect(slowEnd).toBeGreaterThan(criticalEnd);
      expect(Math.abs(slow.value - createSpring(0, 100, 0, { stiffness: 100, damping: 200 }).at(Infinity).position)).toBe(
        0,
      );
    });

    test("a reversal in an overdamped spring still keeps its velocity", () => {
      const options = { stiffness: 100, damping: 40 };
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100, options), 0);
      for (let now = 16; now <= 96; now += 16) sv.frame(now);
      const velocity = sv.animation?.velocity as number;
      expect(velocity).toBeGreaterThan(0);

      sv.assign(withDamped(0, options), 96);
      expect(sv.animation?.velocity).toBe(velocity);
    });
  });

  describe("options validation", () => {
    test("throws the core RangeError synchronously for invalid spring options", () => {
      expect(() => withDamped(1, { duration: 0 })).toThrow(RangeError);
      expect(() => withDamped(1, { stiffness: 100, damping: -1 })).toThrow(RangeError);
      expect(() => withDamped(1, { restDelta: 0 })).toThrow(RangeError);
    });

    test("rejects a non-finite velocity", () => {
      expect(() => withDamped(1, { velocity: Number.NaN })).toThrow(RangeError);
      expect(() => withDamped(1, { velocity: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    });

    test("honors restDelta and restSpeed", () => {
      const loose = new FakeSharedValue(0);
      loose.assign(withDamped(100, { restDelta: 5, restSpeed: 50 }), 0);
      const tight = new FakeSharedValue(0);
      tight.assign(withDamped(100, { restDelta: 1e-6, restSpeed: 1e-6 }), 0);

      expect(run(loose, 0, 16)).toBeLessThan(run(tight, 0, 16));
    });
  });

  describe("reanimated wiring", () => {
    test("passes toValue as the starting value and the callback on the animation object", () => {
      const callback = () => {};
      const created = animation(withDamped(42, undefined, callback));
      expect(fake.defineCalls).toEqual([{ starting: 42 }]);
      expect(created.callback).toBe(callback);
      expect(created.toValue).toBe(42);
      expect(created.current).toBe(42);
      expect(typeof created.onStart).toBe("function");
      expect(typeof created.onFrame).toBe("function");
    });

    test("works as a definition created on the JS runtime and started later", () => {
      runtime.kind = "js";
      const definition = withDamped(100) as unknown as { __isAnimationDefinition?: boolean };
      expect(definition.__isAnimationDefinition).toBe(true);

      const sv = new FakeSharedValue(0);
      sv.assign(definition as never, 0);
      run(sv, 0, 16);
      expect(sv.value).toBe(100);
    });

    test("ReduceMotion.Always jumps to the target and reports completion", () => {
      const calls: unknown[][] = [];
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100, { reduceMotion: ReduceMotion.Always as never }, (...args) => calls.push(args)), 0);
      expect(sv.value).toBe(100);
      expect(calls).toEqual([[true]]);
    });

    test("ReduceMotion.Never animates even when the system asks to reduce motion", () => {
      runtime.systemReduceMotion = true;
      const sv = new FakeSharedValue(0);
      sv.assign(withDamped(100, { reduceMotion: ReduceMotion.Never as never }), 0);
      expect(sv.value).toBe(0);
      expect(sv.running).toBe(true);
    });

    test("the default follows the system setting", () => {
      runtime.systemReduceMotion = true;
      const reduced = new FakeSharedValue(0);
      reduced.assign(withDamped(100), 0);
      expect(reduced.value).toBe(100);

      runtime.systemReduceMotion = false;
      const animated = new FakeSharedValue(0);
      animated.assign(withDamped(100), 0);
      expect(animated.running).toBe(true);
    });

    test("only an explicit reduceMotion is pinned on the animation object", () => {
      expect(animation(withDamped(1)).reduceMotion).toBeUndefined();
      expect(animation(withDamped(1, { reduceMotion: ReduceMotion.System as never })).reduceMotion).toBeUndefined();
      expect(animation(withDamped(1, { reduceMotion: ReduceMotion.Always as never })).reduceMotion).toBe(true);
      expect(animation(withDamped(1, { reduceMotion: ReduceMotion.Never as never })).reduceMotion).toBe(false);
    });
  });
});
