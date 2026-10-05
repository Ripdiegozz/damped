import { expect, test } from "bun:test";
import { buildMark, MASTER, SMALL, type SpiralParams } from "../brand/mark";

test("the master cut matches the approved exploration geometry", () => {
  const mark = buildMark(MASTER);
  // Reference values from the approved `hook(mirror=True)` render on the 32 grid.
  expect(mark.start.cx).toBeCloseTo(4.943, 2);
  expect(mark.start.cy).toBeCloseTo(18.298, 2);
  expect(mark.end.cx).toBeCloseTo(17.136, 2);
  expect(mark.end.cy).toBeCloseTo(24.242, 2);
  expect(mark.dot.cx).toBeCloseTo(18.27, 2);
  expect(mark.dot.cy).toBeCloseTo(18.298, 2);
  expect(mark.dot.r).toBeCloseTo(2.665, 2);
  expect(mark.start.r).toBeCloseTo(1.943, 2);
});

for (const [name, params] of [["master", MASTER], ["small", SMALL]] as const) {
  test(`the ${name} cut is centred on its bounding box and fills its size`, () => {
    const { bounds } = buildMark(params);
    expect((bounds.x0 + bounds.x1) / 2).toBeCloseTo(16, 6);
    expect((bounds.y0 + bounds.y1) / 2).toBeCloseTo(16, 6);
    expect(Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0)).toBeCloseTo(params.size, 6);
  });

  test(`the ${name} cut stops clear of the rest dot`, () => {
    const { end, dot } = buildMark(params);
    const gap = Math.hypot(end.cx - dot.cx, end.cy - dot.cy) - end.r - dot.r;
    expect(gap).toBeGreaterThan(1);
  });

  test(`the ${name} cut is one closed outline with rounded coordinates`, () => {
    const { d } = buildMark(params);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d).not.toMatch(/\d\.\d{3,}/);
  });
}

test("the spiral starts left of the rest dot and opens upwards", () => {
  const { start, end, dot } = buildMark(MASTER);
  expect(start.cx).toBeLessThan(dot.cx);
  expect(end.cy).toBeGreaterThan(dot.cy);
});

test("the outline closes with round caps: two semicircular arcs", () => {
  expect(buildMark(MASTER).d.match(/A/g)).toHaveLength(2);
});

test("the small cut is heavier and its dot larger, relative to its size", () => {
  const relative = (params: SpiralParams) => ({ stroke: buildMark(params).start.r / params.size, dot: buildMark(params).dot.r / params.size });
  expect(relative(SMALL).stroke).toBeGreaterThan(relative(MASTER).stroke);
  expect(relative(SMALL).dot).toBeGreaterThan(relative(MASTER).dot);
});

test("building the same mark twice gives identical output", () => {
  expect(buildMark(MASTER)).toEqual(buildMark(MASTER));
});
