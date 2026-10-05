import { describe, expect, test } from "bun:test";
import { createScheduler, createSpring, createSpringValue, type Scheduler } from "@damped/core";
import { bounceFromZeta } from "../src/components/physics/damping";
import { retarget } from "../src/components/physics/interruption";
import { launch } from "../src/components/physics/launch";
import { createVelocityTracker } from "../src/components/physics/pointer";
import { createSeries } from "../src/components/physics/series";
import { createTrail, phasePoint, samplePhase, phaseScale } from "../src/components/physics/phase";

/** A frame source the test steps by hand, so a spring value advances deterministically. */
function manual(): { scheduler: Scheduler; step(ms: number): void } {
  let callback: ((timestamp: number) => void) | undefined;
  let now = 1000;
  const scheduler = createScheduler({
    request: (next) => {
      callback = next;
      return 1;
    },
    cancel: () => {
      callback = undefined;
    },
  });
  return {
    scheduler,
    step(ms) {
      now += ms;
      const run = callback;
      callback = undefined;
      run?.(now);
    },
  };
}

describe("createVelocityTracker", () => {
  test("measures units per second from the recent samples", () => {
    const tracker = createVelocityTracker();
    for (let ms = 0; ms <= 60; ms += 10) tracker.push(ms, ms * 0.5);
    expect(tracker.velocity(60)).toBeCloseTo(500, 6);
  });

  test("a pointer that has stopped has no velocity, and neither does a single sample", () => {
    const tracker = createVelocityTracker();
    expect(tracker.velocity(0)).toBe(0);
    tracker.push(0, 10);
    expect(tracker.velocity(5)).toBe(0);
    tracker.push(10, 20);
    expect(tracker.velocity(10)).toBeCloseTo(1000, 6);
    // Held still for longer than the stale window before the release.
    expect(tracker.velocity(10 + 200)).toBe(0);
  });

  test("only the last window counts, and reset forgets everything", () => {
    const tracker = createVelocityTracker({ windowMs: 50 });
    tracker.push(0, 0);
    tracker.push(100, 1000);
    tracker.push(120, 1000);
    tracker.push(140, 1000);
    expect(tracker.velocity(140)).toBeCloseTo(0, 6);
    tracker.reset();
    expect(tracker.velocity(140)).toBe(0);
  });

  test("a clock that goes backwards does not produce an infinite velocity", () => {
    const tracker = createVelocityTracker();
    tracker.push(10, 0);
    tracker.push(10, 50);
    expect(Number.isFinite(tracker.velocity(10))).toBe(true);
  });
});

describe("createSeries", () => {
  const box = { width: 200, height: 100 };
  const range = { min: -1, max: 1 };
  const numbers = (path: string): number[] => path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);

  test("draws the latest sample at the right edge and maps the range onto the height", () => {
    const series = createSeries(1000);
    series.push(0, -1);
    series.push(500, 0);
    series.push(1000, 1);
    const { line, zeroY } = series.path(box, range);
    expect(numbers(line)).toEqual([0, 100, 100, 50, 200, 0]);
    expect(zeroY).toBe(50);
  });

  test("keeps one sample before the window so the line reaches the left edge, and drops older ones", () => {
    const series = createSeries(1000);
    for (let ms = 0; ms <= 3000; ms += 500) series.push(ms, 0);
    expect(series.size).toBe(3);
    expect(numbers(series.path(box, range).line)[0]).toBe(0);
  });

  test("values outside the range are clamped to the plot, and ticks outside the window disappear", () => {
    const series = createSeries(1000);
    series.push(0, 5);
    series.push(900, -5);
    series.mark(100);
    series.mark(-4000);
    const { line, marks } = series.path(box, range);
    expect(numbers(line).filter((_, index) => index % 2 === 1)).toEqual([0, 100]);
    expect(numbers(marks)).toEqual([40, 0, 100]);
  });

  test("two series can share one clock through `now`", () => {
    const first = createSeries(1000);
    const second = createSeries(1000);
    first.push(0, 0);
    first.push(1000, 0);
    second.push(0, 0);
    second.push(500, 0);
    expect(numbers(first.path(box, range, 1000).line)[2]).toBe(200);
    expect(numbers(second.path(box, range, 1000).line)[2]).toBe(100);
  });

  test("an empty or single-sample series draws nothing, and clear empties it", () => {
    const series = createSeries(1000);
    expect(series.path(box, range).line).toBe("");
    series.push(0, 0);
    expect(series.path(box, range).line).toBe("");
    series.push(10, 1);
    series.clear();
    expect(series.size).toBe(0);
  });
});

describe("phase portrait", () => {
  const options = (zeta: number) => ({ duration: 1, bounce: bounceFromZeta(zeta) });

  test("phasePoint puts velocity in the units of position (velocity over omega)", () => {
    const point = phasePoint(createSpring(1, 0, 0, options(0.3)).params, { position: 0.5, velocity: 2 * Math.PI });
    expect(point.x).toBeCloseTo(0.5, 12);
    expect(point.y).toBeCloseTo(1, 12);
  });

  test("starts at the given state and ends at rest on the origin", () => {
    const points = samplePhase(options(0.3), { position: 0.8, velocity: 1.5 }, { samples: 240 });
    expect(points[0]!.x).toBeCloseTo(0.8, 12);
    expect(points[0]!.y).toBeCloseTo(1.5 / (2 * Math.PI), 12);
    const last = points.at(-1)!;
    expect(Math.hypot(last.x, last.y)).toBeLessThan(0.01);
  });

  test("an underdamped spring winds inwards: it crosses the position axis several times and the radius shrinks", () => {
    const points = samplePhase(options(0.15), { position: 1, velocity: 0 }, { samples: 1200 });
    const crossings = points.slice(1).filter((point, index) => Math.sign(point.x) !== Math.sign(points[index]!.x)).length;
    expect(crossings).toBeGreaterThanOrEqual(4);
    const radii = points.map((point) => Math.hypot(point.x, point.y));
    // One turn later it is closer to the origin: sample the radius at the start of every turn.
    const perTurn = Math.round(1200 / (points.at(-1)!.t / 1));
    for (let i = perTurn; i < radii.length; i += perTurn) expect(radii[i]!).toBeLessThan(radii[i - perTurn]!);
  });

  test("an overdamped spring never crosses the velocity axis: it is a curve, not a spiral", () => {
    const points = samplePhase(options(2), { position: 1, velocity: 0 }, { samples: 400 });
    expect(points.every((point) => point.x >= -1e-9)).toBe(true);
  });

  test("phaseScale centres the origin, grows right with position and up with velocity", () => {
    const scale = phaseScale({ width: 300, height: 200, padding: 20 }, 1);
    expect(scale.x(0)).toBe(150);
    expect(scale.y(0)).toBe(100);
    expect(scale.x(1)).toBe(280);
    expect(scale.x(-1)).toBe(20);
    expect(scale.y(1)).toBeLessThan(scale.y(0));
    expect(scale.y(1)).toBe(100 - 80);
    expect(scale.invert(280, 100)).toEqual({ x: 1, y: 0 });
  });

  test("invert clamps to the domain", () => {
    const scale = phaseScale({ width: 300, height: 200, padding: 20 }, 1);
    expect(scale.invert(10_000, -10_000)).toEqual({ x: 1, y: 1 });
    expect(scale.invert(-10_000, 10_000)).toEqual({ x: -1, y: -1 });
  });

  test("a trail keeps the last points it was given and draws them as a path", () => {
    const trail = createTrail(3);
    for (const value of [1, 2, 3, 4]) trail.push({ x: value, y: 0 });
    expect(trail.size).toBe(3);
    const scale = phaseScale({ width: 100, height: 100, padding: 0 }, 10);
    expect(trail.path(scale)).toBe("M60 50 L65 50 L70 50");
    trail.clear();
    expect(trail.path(scale)).toBe("");
  });
});

describe("launch", () => {
  const options = { duration: 0.8, bounce: bounceFromZeta(0.4), restDelta: 0.01, restSpeed: 0.1 };

  test("continues from the given position and velocity, exactly like the closed form", async () => {
    const { scheduler, step } = manual();
    const value = createSpringValue(0, { scheduler });
    const finished = launch(value, { position: 80, velocity: 300 }, 0, options);
    const reference = createSpring(80, 0, 300, options);
    step(16); // first frame is t = 0
    expect(value.get()).toBeCloseTo(80, 9);
    expect(value.getVelocity()).toBeCloseTo(300, 9);
    let elapsed = 0;
    for (let frame = 0; frame < 10; frame++) {
      step(16);
      elapsed += 0.016;
      expect(value.get()).toBeCloseTo(reference.at(elapsed).position, 6);
      expect(value.getVelocity()).toBeCloseTo(reference.at(elapsed).velocity, 4);
    }
    for (let frame = 0; frame < 600 && value.animating; frame++) step(16);
    expect(await finished).toBe(true);
    expect(value.get()).toBe(0);
  });

  test("a velocity at the target still moves (an at-rest set would resolve at once)", async () => {
    const { scheduler, step } = manual();
    const value = createSpringValue(0, { scheduler });
    const finished = launch(value, { position: 0, velocity: 200 }, 0, options);
    expect(value.animating).toBe(true);
    step(16);
    step(16);
    expect(value.get()).toBeGreaterThan(0);
    for (let frame = 0; frame < 600 && value.animating; frame++) step(16);
    expect(await finished).toBe(true);
  });

  test("released exactly at rest with no velocity resolves immediately", async () => {
    const { scheduler } = manual();
    const value = createSpringValue(0, { scheduler });
    expect(await launch(value, { position: 0, velocity: 0 }, 0, options)).toBe(true);
    expect(value.animating).toBe(false);
  });

  test("launching again mid-flight supersedes the earlier run", async () => {
    const { scheduler, step } = manual();
    const value = createSpringValue(0, { scheduler });
    const first = launch(value, { position: 50, velocity: 0 }, 0, options);
    step(16);
    step(16);
    const second = launch(value, { position: 20, velocity: -100 }, 0, options);
    expect(await first).toBe(false);
    for (let frame = 0; frame < 600 && value.animating; frame++) step(16);
    expect(await second).toBe(true);
  });
});

describe("retarget: restart against damped", () => {
  const options = { duration: 0.8, bounce: 0.2, restDelta: 0.001, restSpeed: 0.01 };

  function flying() {
    const { scheduler, step } = manual();
    const value = createSpringValue(0, { scheduler });
    void value.set(1, options);
    step(16);
    for (let frame = 0; frame < 12; frame++) step(16);
    return { value, step };
  }

  const furthest = (value: ReturnType<typeof createSpringValue>, step: (ms: number) => void): number => {
    let max = value.get();
    for (let frame = 0; frame < 10; frame++) {
      step(16);
      max = Math.max(max, value.get());
    }
    return max;
  };

  test("the damped lane keeps its velocity through the retarget and carries on forward before it turns", () => {
    const { value, step } = flying();
    const positionBefore = value.get();
    const result = retarget(value, "damped", 0, options);
    expect(result.before).toBeGreaterThan(1);
    expect(result.after).toBe(result.before);
    expect(value.get()).toBe(positionBefore);
    step(16);
    // The new spring continues from the last frame, so one frame later it is the closed form from that state.
    const reference = createSpring(positionBefore, 0, result.before, options).at(0.016);
    expect(value.getVelocity()).toBeCloseTo(reference.velocity, 6);
    expect(value.getVelocity()).toBeGreaterThan(0.5 * result.before);
    expect(furthest(value, step)).toBeGreaterThan(positionBefore + 0.01);
  });

  test("the restart lane starts again from rest at the same position and turns back at once", () => {
    const { value, step } = flying();
    const positionBefore = value.get();
    const result = retarget(value, "restart", 0, options);
    expect(result.before).toBeGreaterThan(1);
    expect(result.after).toBe(0);
    expect(value.get()).toBe(positionBefore);
    step(16);
    expect(value.getVelocity()).toBe(0);
    expect(furthest(value, step)).toBeLessThanOrEqual(positionBefore);
  });

  test("a lane that is at rest reports no velocity either way", () => {
    const { scheduler } = manual();
    for (const mode of ["restart", "damped"] as const) {
      const value = createSpringValue(0, { scheduler });
      const result = retarget(value, mode, 1, options);
      expect(result.before).toBe(0);
      expect(result.after).toBe(0);
      expect(value.animating).toBe(true);
    }
  });

  test("the returned promise settles true when the lane arrives, false when it is retargeted again", async () => {
    const { value, step } = flying();
    const first = retarget(value, "damped", 0, options);
    const second = retarget(value, "damped", 1, options);
    expect(await first.finished).toBe(false);
    for (let frame = 0; frame < 900 && value.animating; frame++) step(16);
    expect(await second.finished).toBe(true);
  });
});
