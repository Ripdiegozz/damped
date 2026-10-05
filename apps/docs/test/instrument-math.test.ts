import { createSpring } from "@damped/core";
import { describe, expect, test } from "bun:test";
import {
  createPhaseTrail,
  createPositionTrail,
  createVelocityTracker,
  dampingRatio,
  formatDamping,
  formatDisplacement,
  limitVelocity,
  percentAt,
  phasePoint,
  SPRING,
} from "../src/components/landing/instrument-math";

describe("percentAt", () => {
  test("maps a pointer x over the rail to 0..100 and clamps outside it", () => {
    expect(percentAt(100, 100, 400)).toBe(0);
    expect(percentAt(300, 100, 400)).toBe(50);
    expect(percentAt(500, 100, 400)).toBe(100);
    expect(percentAt(-50, 100, 400)).toBe(0);
    expect(percentAt(900, 100, 400)).toBe(100);
  });

  test("a rail with no width maps to the middle instead of dividing by zero", () => {
    expect(percentAt(10, 0, 0)).toBe(50);
  });
});

describe("createVelocityTracker", () => {
  test("is zero with fewer than two samples", () => {
    const tracker = createVelocityTracker();
    expect(tracker.velocity(0)).toBe(0);
    tracker.push(0, 10);
    expect(tracker.velocity(5)).toBe(0);
  });

  test("estimates the slope of a steady drag in value per second", () => {
    const tracker = createVelocityTracker();
    // 1 unit per millisecond is 1000 units per second.
    for (let t = 0; t <= 40; t += 8) tracker.push(t, t);
    expect(tracker.velocity(40)).toBeCloseTo(1000, 6);
    const reverse = createVelocityTracker();
    for (let t = 0; t <= 40; t += 8) reverse.push(t, 100 - t * 0.5);
    expect(reverse.velocity(40)).toBeCloseTo(-500, 6);
  });

  test("only reads the recent window, so a slow start does not dilute a fast flick", () => {
    const tracker = createVelocityTracker(45);
    for (let t = 0; t < 400; t += 20) tracker.push(t, t * 0.01);
    for (let t = 400; t <= 440; t += 10) tracker.push(t, 4 + (t - 400));
    expect(tracker.velocity(440)).toBeCloseTo(1000, 6);
  });

  test("a pointer held still before the release carries no velocity", () => {
    const tracker = createVelocityTracker(100, 80);
    for (let t = 0; t <= 40; t += 8) tracker.push(t, t);
    expect(tracker.velocity(40 + 200)).toBe(0);
  });

  test("reset forgets every sample", () => {
    const tracker = createVelocityTracker();
    tracker.push(0, 0);
    tracker.push(10, 10);
    tracker.reset();
    expect(tracker.velocity(10)).toBe(0);
  });

  test("samples at the same instant do not produce NaN", () => {
    const tracker = createVelocityTracker();
    tracker.push(5, 1);
    tracker.push(5, 9);
    expect(tracker.velocity(5)).toBe(0);
  });
});

describe("limitVelocity", () => {
  const peak = (position: number, velocity: number): { low: number; high: number } => {
    const spring = createSpring(position, 50, velocity, SPRING);
    let low = Infinity;
    let high = -Infinity;
    for (let step = 0; step <= 400; step++) {
      const { position: at } = spring.at((spring.settleTime() * step) / 400);
      low = Math.min(low, at);
      high = Math.max(high, at);
    }
    return { low, high };
  };

  test("leaves a velocity that stays on the track alone", () => {
    expect(limitVelocity(80, 50, 0)).toBe(0);
    expect(limitVelocity(80, 50, -300)).toBe(-300);
    expect(limitVelocity(50, 50, 20)).toBe(20);
  });

  test("slows a flick that would throw the mass off the end of the track, and keeps its direction", () => {
    const limited = limitVelocity(90, 50, 2000);
    expect(limited).toBeGreaterThan(0);
    expect(limited).toBeLessThan(2000);
    expect(peak(90, limited).high).toBeLessThanOrEqual(105.5);
    // Near the limit: the largest velocity that fits, not a timid one.
    expect(peak(90, limited * 1.1).high).toBeGreaterThan(105);
    const other = limitVelocity(10, 50, -2000);
    expect(other).toBeLessThan(0);
    expect(peak(10, other).low).toBeGreaterThanOrEqual(-5.5);
  });
});

describe("damping", () => {
  test("the ratio of a parameter set follows damping / (2 sqrt(stiffness mass))", () => {
    expect(dampingRatio({ stiffness: 100, damping: 20, mass: 1 })).toBe(1);
    expect(dampingRatio({ stiffness: 100, damping: 10, mass: 1 })).toBe(0.5);
    expect(dampingRatio({ stiffness: 400, damping: 20, mass: 4 })).toBeCloseTo(20 / (2 * Math.sqrt(1600)), 12);
  });

  test("formats the ratio with two decimals", () => {
    expect(formatDamping(0.65)).toBe("0.65");
    expect(formatDamping(1)).toBe("1.00");
  });
});

describe("formatDisplacement", () => {
  test("always carries a sign, one decimal and never a negative zero", () => {
    expect(formatDisplacement(12.34)).toBe("+12.3 px");
    expect(formatDisplacement(-8)).toBe("−8.0 px");
    expect(formatDisplacement(0)).toBe("+0.0 px");
    expect(formatDisplacement(-0.01)).toBe("+0.0 px");
  });
});

describe("phasePoint", () => {
  test("measures position from the rest point and velocity in units of the natural frequency", () => {
    expect(phasePoint(70, 50, 0, 8)).toEqual({ d: 20, w: 0 });
    expect(phasePoint(50, 50, 80, 8)).toEqual({ d: 0, w: 10 });
    expect(phasePoint(30, 50, -16, 8)).toEqual({ d: -20, w: -2 });
  });

  test("a spring with no natural frequency has no phase velocity instead of Infinity", () => {
    expect(phasePoint(60, 50, 10, 0).w).toBe(0);
  });
});

describe("createPositionTrail", () => {
  test("draws the newest sample at the top and older ones further down, x being the position", () => {
    const trail = createPositionTrail(1000, 120);
    trail.push(0, 10);
    trail.push(100, 20);
    trail.push(200, 30);
    // 200 ms of a 1000 ms window over 50 units of height: the oldest sample sits at y = 10.
    expect(trail.path(50)).toBe("M30 0 L20 5 L10 10");
  });

  test("drops samples older than the window", () => {
    const trail = createPositionTrail(100, 120);
    for (let t = 0; t <= 300; t += 50) trail.push(t, t);
    expect(trail.size).toBeLessThanOrEqual(4);
  });

  test("starts a new stroke after a pause, so two runs never join with a false line", () => {
    const trail = createPositionTrail(5000, 120);
    trail.push(0, 10);
    trail.push(50, 20);
    trail.push(1000, 80);
    trail.push(1050, 90);
    expect(trail.path(100).match(/M/g)).toHaveLength(2);
  });

  test("is empty until it has two samples, and clear empties it", () => {
    const trail = createPositionTrail(1000, 120);
    expect(trail.path(50)).toBe("");
    trail.push(0, 1);
    expect(trail.path(50)).toBe("");
    trail.push(10, 2);
    expect(trail.path(50)).not.toBe("");
    trail.clear();
    expect(trail.size).toBe(0);
    expect(trail.path(50)).toBe("");
  });
});

describe("createPhaseTrail", () => {
  const view = { size: 100, extent: 100 };

  test("puts the rest point at the centre and scales the extent to the box", () => {
    const trail = createPhaseTrail(100);
    trail.push(0, 0);
    expect(trail.head(view)).toEqual({ x: 50, y: 50 });
    trail.push(100, 0);
    expect(trail.head(view)).toEqual({ x: 95, y: 50 });
    // Velocity points up: a positive phase velocity has a smaller y.
    trail.push(0, 100);
    expect(trail.head(view)).toEqual({ x: 50, y: 5 });
  });

  test("joins the points in order into one stroke", () => {
    const trail = createPhaseTrail(100);
    trail.push(0, 0);
    trail.push(100, 0);
    trail.push(0, -100);
    expect(trail.path(view)).toBe("M50 50 L95 50 L50 95");
  });

  test("a retarget moves only the position axis: the velocity of the last point is the velocity of the next", () => {
    const trail = createPhaseTrail(100);
    trail.push(40, 20);
    trail.push(-10, 20);
    const [first, second] = trail.path(view).split(" L");
    expect(first?.split(" ")[1]).toBe(second?.split(" ")[1]);
  });

  test("keeps only the newest points and has no head when empty", () => {
    const trail = createPhaseTrail(3);
    expect(trail.head(view)).toBeUndefined();
    for (let index = 0; index < 10; index++) trail.push(index, 0);
    expect(trail.size).toBe(3);
    expect(trail.path(view).split("L")).toHaveLength(3);
    trail.clear();
    expect(trail.size).toBe(0);
    expect(trail.path(view)).toBe("");
  });
});
