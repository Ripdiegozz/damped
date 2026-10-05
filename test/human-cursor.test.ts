import { describe, expect, test } from "bun:test";
import { between, cursorPath, easeInOut, glideDuration, mulberry32 } from "../scripts/human-cursor";

describe("mulberry32", () => {
  test("is deterministic for a seed and stays in [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(190);
  });

  test("different seeds give different sequences", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("between", () => {
  test("maps a unit random value into the range", () => {
    expect(between(() => 0, 250, 500)).toBe(250);
    expect(between(() => 0.5, 250, 500)).toBe(375);
    expect(between(() => 0.999999, 250, 500)).toBeLessThan(500);
  });
});

describe("easeInOut", () => {
  test("starts at 0, ends at 1 and is 0.5 in the middle", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
  });

  test("never goes backwards and is slow at the ends", () => {
    let last = 0;
    for (let t = 0.01; t <= 1; t += 0.01) {
      const value = easeInOut(t);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
  });
});

describe("glideDuration", () => {
  test("is between 450 and 900 ms and grows with the distance", () => {
    expect(glideDuration(0)).toBe(450);
    expect(glideDuration(5000)).toBe(900);
    expect(glideDuration(300)).toBeGreaterThan(450);
    expect(glideDuration(300)).toBeLessThan(glideDuration(700));
  });
});

describe("cursorPath", () => {
  const from = { x: 100, y: 100 };
  const to = { x: 900, y: 500 };
  const distance = Math.hypot(800, 400);

  test("has the requested number of points and ends exactly on the target", () => {
    const path = cursorPath(from, to, mulberry32(3), 40);
    expect(path).toHaveLength(40);
    expect(path.at(-1)).toEqual(to);
  });

  test("never teleports: no step is more than a few times the average step", () => {
    const path = [from, ...cursorPath(from, to, mulberry32(3), 40)];
    const steps = path.slice(1).map((point, index) => Math.hypot(point.x - path[index]!.x, point.y - path[index]!.y));
    expect(Math.max(...steps)).toBeLessThan((distance / 40) * 3);
  });

  test("curves: it leaves the straight line, but only gently", () => {
    const path = cursorPath(from, to, mulberry32(3), 60);
    const away = path.map((point) => Math.abs((to.x - from.x) * (from.y - point.y) - (from.x - point.x) * (to.y - from.y)) / distance);
    expect(Math.max(...away)).toBeGreaterThan(5);
    expect(Math.max(...away)).toBeLessThan(distance * 0.25);
  });

  test("is reproducible for a seed", () => {
    expect(cursorPath(from, to, mulberry32(9), 30)).toEqual(cursorPath(from, to, mulberry32(9), 30));
    expect(cursorPath(from, to, mulberry32(9), 30)).not.toEqual(cursorPath(from, to, mulberry32(10), 30));
  });

  test("a move of no distance stays put", () => {
    const path = cursorPath(from, from, mulberry32(1), 10);
    expect(path.every((point) => point.x === from.x && point.y === from.y)).toBe(true);
  });
});

describe("cursorPath input validation", () => {
  test("rejects a step count that is not a positive integer", () => {
    for (const steps of [0, -3, 2.5, Number.NaN]) {
      expect(() => cursorPath({ x: 0, y: 0 }, { x: 100, y: 40 }, mulberry32(1), steps)).toThrow(RangeError);
    }
  });
});
