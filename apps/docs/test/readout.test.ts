import { describe, expect, test } from "bun:test";
import { createTrace, formatPixels, formatVelocity } from "../src/components/demos/readout";

describe("formatVelocity", () => {
  test("rounds to whole pixels per second with an explicit sign", () => {
    expect(formatVelocity(412.4)).toBe("+412 px/s");
    expect(formatVelocity(-87.6)).toBe("−88 px/s");
  });

  test("never shows a negative zero or a sign on rest", () => {
    expect(formatVelocity(0)).toBe("0 px/s");
    expect(formatVelocity(-0)).toBe("0 px/s");
    expect(formatVelocity(-0.3)).toBe("0 px/s");
    expect(formatVelocity(0.49)).toBe("0 px/s");
  });

  test("handles large values without separators", () => {
    expect(formatVelocity(12345.6)).toBe("+12346 px/s");
  });
});

describe("formatPixels", () => {
  test("rounds to one decimal and never shows -0.0", () => {
    expect(formatPixels(12.345)).toBe("12.3 px");
    expect(formatPixels(-0.01)).toBe("0.0 px");
  });
});

describe("createTrace", () => {
  const box = { width: 100, height: 40 };

  test("is empty until it has two samples", () => {
    const trace = createTrace(1000);
    expect(trace.path(box).line).toBe("");
    trace.push(0, 10);
    expect(trace.path(box).line).toBe("");
  });

  test("forgets samples older than its window", () => {
    const trace = createTrace(1000);
    for (let t = 0; t <= 3000; t += 100) trace.push(t, t);
    expect(trace.size).toBeLessThanOrEqual(12);
  });

  test("scales to the largest speed seen, keeping zero on the middle line", () => {
    const trace = createTrace(1000);
    trace.push(0, 0);
    trace.push(500, 200);
    trace.push(1000, -200);
    const { line, zeroY } = trace.path(box);
    expect(zeroY).toBeCloseTo(20, 5);
    const ys = [...line.matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((match) => Number(match[2]));
    expect(ys[0]).toBeCloseTo(20, 2);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(40);
    // +200 draws above the zero line, -200 below it.
    expect(ys[1]!).toBeLessThan(20);
    expect(ys[2]!).toBeGreaterThan(20);
  });

  test("does not blow up on a flat zero trace", () => {
    const trace = createTrace(1000);
    trace.push(0, 0);
    trace.push(100, 0);
    expect(trace.path(box).line).not.toMatch(/NaN|Infinity/);
  });

  test("marks only the retargets that are still inside the window", () => {
    const trace = createTrace(1000);
    trace.push(0, 0);
    trace.mark(0);
    trace.push(900, 5);
    trace.mark(900);
    trace.push(1500, 5);
    const { marks } = trace.path(box);
    const xs = [...marks.matchAll(/M([-\d.]+) /g)].map((match) => Number(match[1]));
    expect(xs).toHaveLength(1);
    expect(xs[0]).toBeCloseTo(((900 - 500) / 1000) * 100, 2);
  });

  test("clear() empties it", () => {
    const trace = createTrace(1000);
    trace.push(0, 1);
    trace.push(1, 2);
    trace.clear();
    expect(trace.size).toBe(0);
    expect(trace.path(box).line).toBe("");
  });
});
