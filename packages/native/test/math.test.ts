import { describe, expect, test } from "bun:test";
import { createSpring, springParams, type SpringOptions } from "../../core/src/spring";
import { dampedParams, dampedRestThresholds, dampedState, isRest } from "../src/math";

const TOLERANCE = 1e-9;

const SPRINGS: Record<string, SpringOptions> = {
  underdamped: { duration: 0.5, bounce: 0.4 },
  "default options": {},
  "critical (bounce 0)": { duration: 0.6, bounce: 0 },
  "critical (physical)": { stiffness: 100, damping: 20, mass: 1 },
  "overdamped (bounce -0.5)": { duration: 0.5, bounce: -0.5 },
  "overdamped (large zeta)": { stiffness: 100, damping: 2000, mass: 1 },
  undamped: { stiffness: 80, damping: 0 },
  "heavy underdamped": { stiffness: 300, damping: 12, mass: 2.5 },
};

const TIMES = [0, 1e-6, 0.001, 0.016, 0.0334, 0.1, 0.25, 0.5, 1, 2.5, 7, 20, 100];
const START_CONDITIONS = [
  { from: 100, to: 0, v0: 0 },
  { from: 0, to: 100, v0: 350 },
  { from: -40, to: 25, v0: -900 },
  { from: 10, to: 10, v0: 500 },
];

describe("dampedState parity with the core spring", () => {
  for (const [name, options] of Object.entries(SPRINGS)) {
    test(`${name}: position and velocity match within ${TOLERANCE}`, () => {
      const params = dampedParams(options);
      for (const { from, to, v0 } of START_CONDITIONS) {
        const spring = createSpring(from, to, v0, options);
        for (const t of TIMES) {
          const expected = spring.at(t);
          const actual = dampedState(from - to, v0, params, t);
          expect(Math.abs(actual.position + to - expected.position)).toBeLessThanOrEqual(TOLERANCE);
          expect(Math.abs(actual.velocity - expected.velocity)).toBeLessThanOrEqual(TOLERANCE);
        }
      }
    });
  }

  test("t <= 0 returns the initial conditions", () => {
    const params = dampedParams({ duration: 0.5, bounce: 0.2 });
    expect(dampedState(12, -3, params, 0)).toEqual({ position: 12, velocity: -3 });
    expect(dampedState(12, -3, params, -1)).toEqual({ position: 12, velocity: -3 });
  });

  test("the overdamped slow root stays accurate for a very large damping ratio", () => {
    const options = { stiffness: 100, damping: 1e7, mass: 1 };
    const params = dampedParams(options);
    const spring = createSpring(1, 0, 0, options);
    for (const t of [0.01, 1, 100, 10_000]) {
      const actual = dampedState(1, 0, params, t);
      expect(Math.abs(actual.position - spring.at(t).position)).toBeLessThanOrEqual(TOLERANCE);
      expect(Number.isFinite(actual.position)).toBe(true);
    }
    // The slow mode is r1 = -k / c, so x(t) ~ exp(-k t / c).
    expect(dampedState(1, 0, params, 1e5).position).toBeCloseTo(Math.exp(-(100 * 1e5) / 1e7), 6);
  });
});

describe("dampedParams parity with springParams", () => {
  const durations = [0.05, 0.1, 0.25, 0.5, 0.8, 1, 2.5];
  const bounces = [-0.99, -0.75, -0.5, -0.2, 0, 0.1, 0.15, 0.4, 0.75, 0.99];

  test("matches for a grid of duration and bounce values", () => {
    for (const duration of durations) {
      for (const bounce of bounces) {
        expect(dampedParams({ duration, bounce })).toEqual(springParams({ duration, bounce }));
      }
    }
  });

  test("matches the defaults and partial perceptual options", () => {
    expect(dampedParams()).toEqual(springParams());
    expect(dampedParams({})).toEqual(springParams({}));
    expect(dampedParams({ duration: 1 })).toEqual(springParams({ duration: 1 }));
    expect(dampedParams({ bounce: -0.3 })).toEqual(springParams({ bounce: -0.3 }));
    expect(dampedParams().stiffness).toBeCloseTo((4 * Math.PI) ** 2, 9);
    expect(dampedParams().damping).toBeCloseTo(2 * 0.85 * 4 * Math.PI, 9);
  });

  test("passes physical options through, defaulting the mass to 1", () => {
    expect(dampedParams({ stiffness: 170, damping: 26 })).toEqual({ stiffness: 170, damping: 26, mass: 1 });
    expect(dampedParams({ stiffness: 300, damping: 12, mass: 2.5 })).toEqual({
      stiffness: 300,
      damping: 12,
      mass: 2.5,
    });
    expect(dampedParams({ stiffness: 100, damping: 0 })).toEqual(springParams({ stiffness: 100, damping: 0 }));
  });

  const INVALID: Array<[string, SpringOptions]> = [
    ["zero duration", { duration: 0 }],
    ["negative duration", { duration: -1 }],
    ["NaN duration", { duration: Number.NaN }],
    ["infinite duration", { duration: Number.POSITIVE_INFINITY }],
    ["bounce of 1", { bounce: 1 }],
    ["bounce of -1", { bounce: -1 }],
    ["NaN bounce", { bounce: Number.NaN }],
    ["zero stiffness", { stiffness: 0, damping: 10 }],
    ["negative stiffness", { stiffness: -5, damping: 10 }],
    ["negative damping", { stiffness: 100, damping: -1 }],
    ["infinite damping", { stiffness: 100, damping: Number.POSITIVE_INFINITY }],
    ["zero mass", { stiffness: 100, damping: 10, mass: 0 }],
    ["zero restDelta", { restDelta: 0 }],
    ["negative restSpeed", { restSpeed: -1 }],
    ["NaN restDelta on a physical spring", { stiffness: 100, damping: 10, restDelta: Number.NaN }],
  ];

  for (const [name, options] of INVALID) {
    test(`throws the same RangeError as the core for ${name}`, () => {
      let coreMessage = "";
      try {
        springParams(options);
      } catch (error) {
        expect(error).toBeInstanceOf(RangeError);
        coreMessage = (error as RangeError).message;
      }
      expect(coreMessage).not.toBe("");
      expect(() => dampedParams(options)).toThrow(RangeError);
      expect(() => dampedParams(options)).toThrow(coreMessage);
    });
  }
});

describe("rest detection", () => {
  test("isRest defaults to restDelta 0.001 and restSpeed 0.01", () => {
    expect(isRest(0.001, 0.01)).toBe(true);
    expect(isRest(-0.001, -0.01)).toBe(true);
    expect(isRest(0.0011, 0)).toBe(false);
    expect(isRest(0, 0.0101)).toBe(false);
    expect(isRest(0, 0)).toBe(true);
  });

  test("isRest honors explicit thresholds", () => {
    expect(isRest(0.5, 3, 0.5, 3)).toBe(true);
    expect(isRest(0.5, 3.1, 0.5, 3)).toBe(false);
    expect(isRest(0.6, 3, 0.5, 3)).toBe(false);
  });

  test("dampedRestThresholds resolves the defaults and validates", () => {
    expect(dampedRestThresholds()).toEqual({ restDelta: 0.001, restSpeed: 0.01 });
    expect(dampedRestThresholds({ restDelta: 0.5, restSpeed: 2 })).toEqual({ restDelta: 0.5, restSpeed: 2 });
    expect(() => dampedRestThresholds({ restDelta: 0 })).toThrow(RangeError);
    expect(() => dampedRestThresholds({ restSpeed: Number.NaN })).toThrow(RangeError);
  });

  for (const [name, options] of Object.entries(SPRINGS)) {
    test(`${name}: agrees with the core isSettled along the trajectory`, () => {
      const spring = createSpring(100, 0, 250, options);
      const params = dampedParams(options);
      const { restDelta, restSpeed } = dampedRestThresholds(options);
      for (let t = 0; t <= 12; t += 0.037) {
        const state = dampedState(100, 250, params, t);
        expect(isRest(state.position, state.velocity, restDelta, restSpeed)).toBe(spring.isSettled(t));
      }
    });
  }

  test("a settled spring at the core settleTime is at rest", () => {
    const options = { duration: 0.5, bounce: 0.3, restDelta: 0.01, restSpeed: 0.1 };
    const spring = createSpring(100, 0, 0, options);
    const params = dampedParams(options);
    const settle = spring.settleTime();
    const after = dampedState(100, 0, params, settle);
    expect(isRest(after.position, after.velocity, 0.01, 0.1)).toBe(true);
    const before = dampedState(100, 0, params, settle * 0.5);
    expect(isRest(before.position, before.velocity, 0.01, 0.1)).toBe(false);
  });
});
