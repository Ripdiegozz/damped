import { describe, expect, test } from "bun:test";
import { createSpring, springParams } from "@damped/core";
import { bounceFromZeta, classifyDamping, peakOvershoot, sampleResponse, zetaFromBounce } from "../src/components/physics/damping";
import { coilAmplitude, coilPath, COIL } from "../src/components/physics/coil";

const ratio = (options: Parameters<typeof springParams>[0]): number => {
  const { stiffness, damping, mass } = springParams(options);
  return damping / (2 * Math.sqrt(stiffness * mass));
};

describe("the damping ratio and the perceptual bounce", () => {
  test.each([0.15, 0.3, 0.5, 0.85, 1, 1.25, 2])("bounceFromZeta(%f) resolves through springParams to the same zeta", (zeta) => {
    expect(ratio({ duration: 0.6, bounce: bounceFromZeta(zeta) })).toBeCloseTo(zeta, 10);
  });

  test("zetaFromBounce is the inverse of bounceFromZeta and matches the documented table", () => {
    expect(zetaFromBounce(0.5)).toBeCloseTo(0.5, 12);
    expect(zetaFromBounce(0)).toBe(1);
    expect(zetaFromBounce(-0.5)).toBeCloseTo(2, 12);
    for (const zeta of [0.2, 0.7, 1, 1.6]) expect(zetaFromBounce(bounceFromZeta(zeta))).toBeCloseTo(zeta, 12);
  });

  test("rejects a ratio that has no bounce", () => {
    expect(() => bounceFromZeta(0)).toThrow(RangeError);
    expect(() => bounceFromZeta(Number.NaN)).toThrow(RangeError);
  });

  test("classifies under, critical and over damping", () => {
    expect(classifyDamping(0.5)).toBe("underdamped");
    expect(classifyDamping(1)).toBe("critically damped");
    expect(classifyDamping(1 + 1e-9)).toBe("critically damped");
    expect(classifyDamping(1.5)).toBe("overdamped");
  });
});

describe("the closed-form response", () => {
  test("a critically damped spring follows 1 - (1 + wt) e^(-wt)", () => {
    const omega = (2 * Math.PI) / 0.8;
    const spring = createSpring(0, 1, 0, { duration: 0.8, bounce: bounceFromZeta(1) });
    for (const t of [0.05, 0.2, 0.5, 1.1]) {
      expect(spring.at(t).position).toBeCloseTo(1 - (1 + omega * t) * Math.exp(-omega * t), 9);
    }
  });

  test.each([0.15, 0.3, 0.5, 0.85])("peakOvershoot(%f) is the real peak of the sampled spring", (zeta) => {
    const curve = sampleResponse({ duration: 0.6, bounce: bounceFromZeta(zeta) }, { tMax: 2, samples: 4000 });
    expect(curve.yMax - 1).toBeCloseTo(peakOvershoot(zeta), 3);
  });

  test("no overshoot at or above critical damping", () => {
    expect(peakOvershoot(1)).toBe(0);
    expect(peakOvershoot(2)).toBe(0);
    const curve = sampleResponse({ duration: 0.6, bounce: bounceFromZeta(2) }, { tMax: 2, samples: 400 });
    expect(Math.max(...curve.points.map((point) => point.x))).toBeLessThanOrEqual(1);
  });

  test("samples cover [0, tMax] and start at rest on 0", () => {
    const curve = sampleResponse({ duration: 0.6, bounce: 0.3 }, { tMax: 2, samples: 50, yMin: -0.1, yMax: 1.7 });
    expect(curve.points).toHaveLength(51);
    expect(curve.points[0]).toEqual({ t: 0, x: 0 });
    expect(curve.points.at(-1)!.t).toBe(2);
    expect(curve.tMax).toBe(2);
    // The caller fixes the axis, so the plot does not rescale while a slider moves.
    expect([curve.yMin, curve.yMax]).toEqual([-0.1, 1.7]);
  });

  test("rejects fewer than two samples", () => {
    expect(() => sampleResponse({ duration: 0.6, bounce: 0 }, { tMax: 1, samples: 1 })).toThrow(RangeError);
  });
});

describe("the spring coil", () => {
  const length = (value: number): number => value;

  test("it starts at the wall, ends at the mass and sits on the axis at both ends", () => {
    const numbers = coilPath(20, 330, 75).match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(numbers.slice(0, 2)).toEqual([20, 75]);
    expect(numbers.slice(-2)).toEqual([330, 75]);
    // M, a lead, the zigzag, a lead, the end: two numbers each.
    expect(numbers).toHaveLength(2 * (COIL.segments + 4));
  });

  test("stretching flattens the coil and compressing deepens it, within the cap", () => {
    const rest = coilAmplitude(length(310));
    expect(coilAmplitude(length(380))).toBeLessThan(rest);
    expect(coilAmplitude(length(250))).toBeGreaterThan(rest);
    expect(coilAmplitude(length(40))).toBe(COIL.maxAmplitude);
  });

  test("a fully stretched coil is a straight line", () => {
    const straight = 2 * COIL.lead + COIL.segments * COIL.wire;
    expect(coilAmplitude(straight)).toBe(0);
    expect(coilAmplitude(straight + 50)).toBe(0);
    const ys = new Set(coilPath(0, straight + 50, 40).match(/ (-?\d+(?:\.\d+)?)(?=[ L]|$)/g));
    expect(ys.size).toBe(1);
  });

  test("the wire keeps its length: amplitude follows sqrt(wire^2 - dx^2) between the caps", () => {
    const span = 300;
    const dx = (span - 2 * COIL.lead) / COIL.segments;
    const expected = Math.sqrt(COIL.wire ** 2 - dx ** 2);
    expect(coilAmplitude(span)).toBeCloseTo(Math.min(expected, COIL.maxAmplitude), 10);
  });
});
