import { describe, expect, test } from "bun:test";
import { createSpring } from "@damped/core";
import { curvePath, describeSpring, sampleCurve } from "../src/components/demos/spring-curve";

describe("sampleCurve", () => {
  test("starts at 0, ends at the target and reads the spring analytically", () => {
    const curve = sampleCurve({ bounce: 0.3, duration: 0.6 }, 50);
    const spring = createSpring(0, 1, 0, { bounce: 0.3, duration: 0.6 });
    expect(curve.points).toHaveLength(51);
    expect(curve.points[0]).toEqual({ t: 0, x: 0 });
    const last = curve.points.at(-1)!;
    expect(last.t).toBeCloseTo(curve.tMax, 10);
    expect(Math.abs(last.x - 1)).toBeLessThan(0.01);
    const middle = curve.points[25]!;
    expect(middle.x).toBeCloseTo(spring.at(middle.t).position, 12);
  });

  test("the time axis covers the settle time and the duration", () => {
    const curve = sampleCurve({ bounce: 0.1, duration: 1.2 }, 20);
    const spring = createSpring(0, 1, 0, { bounce: 0.1, duration: 1.2 });
    expect(curve.tMax).toBeGreaterThanOrEqual(spring.settleTime());
    expect(curve.tMax).toBeGreaterThanOrEqual(1.2);
    expect(curve.settleTime).toBeCloseTo(spring.settleTime(), 12);
  });

  test("a bouncy spring overshoots 1, a critically damped one does not", () => {
    expect(sampleCurve({ bounce: 0.6, duration: 0.5 }, 80).yMax).toBeGreaterThan(1.05);
    expect(sampleCurve({ bounce: 0, duration: 0.5 }, 80).yMax).toBeLessThanOrEqual(1);
  });

  test("the vertical range always contains 0 and 1", () => {
    for (const bounce of [-0.5, 0, 0.5]) {
      const { yMin, yMax } = sampleCurve({ bounce, duration: 0.4 }, 40);
      expect(yMin).toBeLessThanOrEqual(0);
      expect(yMax).toBeGreaterThanOrEqual(1);
    }
  });

  test("rejects fewer than two samples", () => {
    expect(() => sampleCurve({ bounce: 0, duration: 0.5 }, 1)).toThrow(RangeError);
  });

  test("propagates invalid spring options from the core", () => {
    expect(() => sampleCurve({ bounce: 1, duration: 0.5 }, 10)).toThrow(RangeError);
  });
});

describe("curvePath", () => {
  const box = { width: 200, height: 100, padding: 10 };

  test("maps the first and last sample into the padded box (y grows downwards)", () => {
    const curve = sampleCurve({ bounce: 0, duration: 0.5 }, 10);
    const path = curvePath(curve, box);
    const commands = path.match(/[ML][-\d. ]+/g)!;
    expect(commands).toHaveLength(11);
    const [x0, y0] = commands[0]!.slice(1).trim().split(" ").map(Number);
    const [xn] = commands.at(-1)!.slice(1).trim().split(" ").map(Number);
    expect(commands[0]![0]).toBe("M");
    expect(x0).toBeCloseTo(10, 2);
    expect(xn).toBeCloseTo(190, 2);
    // x = 0 sits on the bottom edge of the plot when the vertical range starts at 0.
    expect(y0).toBeCloseTo(90, 2);
  });

  test("never writes NaN or Infinity", () => {
    const path = curvePath(sampleCurve({ bounce: 0.9, duration: 2 }, 120), box);
    expect(path).not.toMatch(/NaN|Infinity/);
  });
});

describe("describeSpring", () => {
  test("reports the physical parameters and settle time of the perceptual ones", () => {
    const info = describeSpring({ bounce: 0.15, duration: 0.5 });
    const spring = createSpring(0, 1, 0, { bounce: 0.15, duration: 0.5 });
    expect(info.stiffness).toBeCloseTo(spring.params.stiffness, 10);
    expect(info.damping).toBeCloseTo(spring.params.damping, 10);
    expect(info.mass).toBe(1);
    expect(info.settleTime).toBeCloseTo(spring.settleTime(), 10);
  });

  test("calls a negative bounce overdamped and a positive one underdamped", () => {
    expect(describeSpring({ bounce: -0.4, duration: 0.5 }).kind).toBe("overdamped");
    expect(describeSpring({ bounce: 0, duration: 0.5 }).kind).toBe("critically damped");
    expect(describeSpring({ bounce: 0.4, duration: 0.5 }).kind).toBe("underdamped");
  });
});
