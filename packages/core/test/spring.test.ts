import { describe, expect, test } from "bun:test";
import { createSpring, springParams, type SpringOptions } from "../src/spring";

const TWO_PI = 2 * Math.PI;

const dampingRatio = ({ stiffness, damping, mass }: { stiffness: number; damping: number; mass: number }) =>
  damping / (2 * Math.sqrt(stiffness * mass));

// Reference integrator: classic RK4 on x'' = (-k x - c v) / m, in displacement coordinates.
function rk4(
  params: { stiffness: number; damping: number; mass: number },
  x0: number,
  v0: number,
  t: number,
  maxStep = 1e-4,
): { position: number; velocity: number } {
  const { stiffness: k, damping: c, mass: m } = params;
  const steps = Math.max(1, Math.ceil(t / maxStep));
  const h = t / steps;
  const accel = (x: number, v: number) => (-k * x - c * v) / m;
  let x = x0;
  let v = v0;
  for (let i = 0; i < steps; i++) {
    const k1x = v;
    const k1v = accel(x, v);
    const k2x = v + 0.5 * h * k1v;
    const k2v = accel(x + 0.5 * h * k1x, v + 0.5 * h * k1v);
    const k3x = v + 0.5 * h * k2v;
    const k3v = accel(x + 0.5 * h * k2x, v + 0.5 * h * k2v);
    const k4x = v + h * k3v;
    const k4v = accel(x + h * k3x, v + h * k3v);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return { position: x, velocity: v };
}

const expectClose = (actual: number, expected: number, tolerance = 1e-6) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)));
};

describe("springParams", () => {
  test("bounce 0 is critically damped", () => {
    expect(dampingRatio(springParams({ bounce: 0 }))).toBeCloseTo(1, 10);
  });

  test("positive bounce is underdamped with zeta = 1 - bounce", () => {
    expect(dampingRatio(springParams({ bounce: 0.5 }))).toBeCloseTo(0.5, 10);
  });

  test("negative bounce is overdamped with zeta = 1 / (1 + bounce)", () => {
    expect(dampingRatio(springParams({ bounce: -0.5 }))).toBeCloseTo(2, 10);
  });

  test("stiffness follows the duration and mass is 1", () => {
    const params = springParams({ duration: 0.8, bounce: 0.2 });
    expect(params.stiffness).toBeCloseTo((TWO_PI / 0.8) ** 2, 10);
    expect(params.mass).toBe(1);
  });

  test("defaults are duration 0.5 and bounce 0.15", () => {
    expect(springParams()).toEqual(springParams({ duration: 0.5, bounce: 0.15 }));
    expect(springParams().stiffness).toBeCloseTo((TWO_PI / 0.5) ** 2, 10);
    expect(dampingRatio(springParams())).toBeCloseTo(0.85, 10);
  });

  test("physical options pass through with mass defaulting to 1", () => {
    expect(springParams({ stiffness: 170, damping: 26 })).toEqual({ stiffness: 170, damping: 26, mass: 1 });
    expect(springParams({ stiffness: 170, damping: 26, mass: 2 })).toEqual({
      stiffness: 170,
      damping: 26,
      mass: 2,
    });
  });
});

describe("validation", () => {
  const invalid: [string, SpringOptions][] = [
    ["zero duration", { duration: 0 }],
    ["negative duration", { duration: -1 }],
    ["NaN duration", { duration: Number.NaN }],
    ["infinite duration", { duration: Number.POSITIVE_INFINITY }],
    ["bounce of 1", { bounce: 1 }],
    ["bounce of -1", { bounce: -1 }],
    ["NaN bounce", { bounce: Number.NaN }],
    ["infinite bounce", { bounce: Number.POSITIVE_INFINITY }],
    ["zero stiffness", { stiffness: 0, damping: 10 }],
    ["negative stiffness", { stiffness: -5, damping: 10 }],
    ["infinite stiffness", { stiffness: Number.POSITIVE_INFINITY, damping: 10 }],
    ["negative damping", { stiffness: 100, damping: -1 }],
    ["NaN damping", { stiffness: 100, damping: Number.NaN }],
    ["zero mass", { stiffness: 100, damping: 10, mass: 0 }],
    ["negative mass", { stiffness: 100, damping: 10, mass: -1 }],
    ["zero restDelta", { restDelta: 0 }],
    ["negative restDelta", { restDelta: -0.1 }],
    ["NaN restDelta", { restDelta: Number.NaN }],
    ["zero restSpeed", { restSpeed: 0 }],
    ["infinite restSpeed", { restSpeed: Number.POSITIVE_INFINITY }],
    ["restDelta on a physical spring", { stiffness: 100, damping: 10, restDelta: 0 }],
  ];

  for (const [name, options] of invalid) {
    test(`${name} throws RangeError`, () => {
      expect(() => springParams(options)).toThrow(RangeError);
      expect(() => createSpring(0, 1, 0, options)).toThrow(RangeError);
    });
  }

  test("zero damping is allowed", () => {
    expect(() => springParams({ stiffness: 100, damping: 0 })).not.toThrow();
  });
});

describe("at()", () => {
  test("at(0) returns exactly the start position and velocity", () => {
    const spring = createSpring(0.1, 0.3, 123.456);
    expect(spring.at(0)).toEqual({ position: 0.1, velocity: 123.456 });
  });

  test("negative time is treated as zero", () => {
    const spring = createSpring(0.1, 0.3, 7);
    expect(spring.at(-1)).toEqual(spring.at(0));
  });

  test("exposes its construction inputs", () => {
    const spring = createSpring(2, 5, 3, { stiffness: 100, damping: 10 });
    expect(spring.from).toBe(2);
    expect(spring.to).toBe(5);
    expect(spring.velocity).toBe(3);
    expect(spring.params).toEqual({ stiffness: 100, damping: 10, mass: 1 });
  });

  const regimes: [string, SpringOptions][] = [
    ["underdamped", { duration: 0.5, bounce: 0.3 }],
    ["critically damped", { duration: 0.5, bounce: 0 }],
    ["overdamped", { duration: 0.5, bounce: -0.5 }],
    ["heavily overdamped", { stiffness: 100, damping: 60 }],
    ["physical with mass", { stiffness: 300, damping: 12, mass: 2.5 }],
  ];

  for (const [name, options] of regimes) {
    test(`${name} matches an RK4 reference in position and velocity`, () => {
      const from = 10;
      const to = 250;
      const v0 = -400;
      const spring = createSpring(from, to, v0, options);
      for (const t of [0.05, 0.13, 0.4, 1.0]) {
        const expected = rk4(spring.params, from - to, v0, t);
        const actual = spring.at(t);
        expectClose(actual.position - to, expected.position);
        expectClose(actual.velocity, expected.velocity);
      }
    });
  }

  test("converges to the target and rests", () => {
    for (const [, options] of regimes) {
      const spring = createSpring(0, 100, 50, options);
      const end = spring.at(10);
      expect(Math.abs(end.position - 100)).toBeLessThanOrEqual(0.001);
      expect(Math.abs(end.velocity)).toBeLessThanOrEqual(0.01);
    }
  });

  test("underdamped from rest overshoots the target", () => {
    const spring = createSpring(0, 1, 0, { duration: 0.5, bounce: 0.3 });
    let peak = 0;
    for (let i = 0; i <= 500; i++) peak = Math.max(peak, spring.at(i / 500).position);
    expect(peak).toBeGreaterThan(1.01);
  });

  test("critically damped from rest never crosses the target", () => {
    const spring = createSpring(0, 1, 0, { duration: 0.5, bounce: 0 });
    for (let i = 0; i <= 1000; i++) expect(spring.at(i / 500).position).toBeLessThanOrEqual(1 + 1e-12);
  });

  test("overdamped from rest never crosses the target", () => {
    const spring = createSpring(0, 1, 0, { duration: 0.5, bounce: -0.6 });
    for (let i = 0; i <= 1000; i++) expect(spring.at(i / 500).position).toBeLessThanOrEqual(1 + 1e-12);
  });

  test("retargeting from a running spring keeps position and velocity", () => {
    const first = createSpring(0, 300, 20, { duration: 0.6, bounce: 0.2 });
    const state = first.at(0.17);
    const second = createSpring(state.position, -120, state.velocity, { duration: 0.6, bounce: 0.2 });
    expect(second.at(0)).toEqual(state);
    expect(second.at(0).velocity).toBe(state.velocity);
  });

  test("retargeting to the same target continues the same trajectory", () => {
    const options: SpringOptions = { duration: 0.6, bounce: 0.2 };
    const first = createSpring(0, 300, 20, options);
    const state = first.at(0.17);
    const second = createSpring(state.position, 300, state.velocity, options);
    for (const dt of [0.05, 0.2, 0.5]) {
      expectClose(second.at(dt).position, first.at(0.17 + dt).position, 1e-9);
      expectClose(second.at(dt).velocity, first.at(0.17 + dt).velocity, 1e-9);
    }
  });

  test("state depends only on elapsed time, not on frame sizes", () => {
    const spring = createSpring(0, 1, 5, { duration: 0.5, bounce: 0.15 });
    const at60 = spring.at(30 / 60);
    const at120 = spring.at(60 / 120);
    let elapsedMs = 0;
    for (const stepMs of [100, 200, 50, 150]) elapsedMs += stepMs;
    const irregular = spring.at(elapsedMs / 1000);
    expect(at120).toEqual(at60);
    expect(irregular).toEqual(at60);
  });

  test("is symmetric for negative direction and large spans", () => {
    const options: SpringOptions = { duration: 0.5, bounce: 0.25 };
    const down = createSpring(0, -500, -80, options);
    const up = createSpring(0, 500, 80, options);
    for (const t of [0, 0.05, 0.2, 0.7, 2]) {
      expectClose(down.at(t).position, -up.at(t).position, 1e-12);
      expectClose(down.at(t).velocity, -up.at(t).velocity, 1e-12);
    }
    expect(down.settleTime()).toBeCloseTo(up.settleTime(), 12);
  });
});

describe("settling", () => {
  const cases: [string, number, number, number, SpringOptions | undefined][] = [
    ["default", 0, 1, 0, undefined],
    ["underdamped with velocity", 0, 300, -900, { duration: 0.5, bounce: 0.6 }],
    ["critically damped with velocity", 0, 300, 2000, { duration: 0.5, bounce: 0 }],
    ["critically damped against the target", 0, 300, -5000, { duration: 0.4, bounce: 0 }],
    ["overdamped", 0, -500, 300, { duration: 0.5, bounce: -0.5 }],
    ["heavily overdamped", 0, 1, 0, { stiffness: 100, damping: 60 }],
    ["large span", 0, -500, 0, { duration: 0.3, bounce: 0.4 }],
    ["custom thresholds", 0, 1, 0, { restDelta: 0.1, restSpeed: 0.5 }],
  ];

  test("is not settled at the start when from differs from to", () => {
    expect(createSpring(0, 1).isSettled(0)).toBe(false);
  });

  for (const [name, from, to, v0, options] of cases) {
    test(`${name}: settles at settleTime() and stays settled`, () => {
      const spring = createSpring(from, to, v0, options);
      const settle = spring.settleTime();
      expect(Number.isFinite(settle)).toBe(true);
      expect(settle).toBeGreaterThan(0);
      expect(spring.isSettled(settle)).toBe(true);
      for (let i = 0; i <= 2000; i++) expect(spring.isSettled(settle + i / 200)).toBe(true);
    });

    test(`${name}: settleTime() is not wildly conservative`, () => {
      const spring = createSpring(from, to, v0, options);
      expect(spring.settleTime()).toBeLessThan(10);
    });
  }

  test("undamped spring never settles", () => {
    expect(createSpring(0, 1, 0, { stiffness: 100, damping: 0 }).settleTime()).toBe(Number.POSITIVE_INFINITY);
  });

  test("already at rest on the target is settled immediately", () => {
    const spring = createSpring(4, 4);
    expect(spring.isSettled(0)).toBe(true);
    expect(spring.settleTime()).toBe(0);
  });

  test("already at rest on the target stays settled even when undamped", () => {
    expect(createSpring(4, 4, 0, { stiffness: 100, damping: 0 }).settleTime()).toBe(0);
  });

  test("starting within the rest thresholds is settled at time zero", () => {
    const spring = createSpring(1, 1.00001, 0.001);
    expect(spring.isSettled(0)).toBe(true);
    expect(spring.settleTime()).toBe(0);
  });
});
