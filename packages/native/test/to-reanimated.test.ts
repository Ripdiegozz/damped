import { describe, expect, mock, test } from "bun:test";
import type { WithSpringConfig } from "react-native-reanimated";
import { springParams, type SpringOptions } from "../../core/src/spring";
import * as fake from "./fake-reanimated";

mock.module("react-native-reanimated", () => ({
  defineAnimation: fake.defineAnimation,
  ReduceMotion: fake.ReduceMotion,
}));

const { toReanimated } = await import("../src/index");

const GRID: SpringOptions[] = [
  {},
  { duration: 0.25 },
  { duration: 0.5, bounce: 0 },
  { duration: 0.8, bounce: 0.4 },
  { duration: 1.2, bounce: -0.5 },
  { duration: 0.35, bounce: 0.99 },
  { duration: 0.35, bounce: -0.99 },
  { stiffness: 170, damping: 26 },
  { stiffness: 300, damping: 12, mass: 2.5 },
  { stiffness: 100, damping: 2000 },
  { stiffness: 100, damping: 0 },
];

describe("toReanimated", () => {
  test("returns exactly the core physical params for a grid of options", () => {
    for (const options of GRID) {
      expect(toReanimated(options)).toEqual(springParams(options));
    }
  });

  test("defaults to the perceptual defaults of the core", () => {
    expect(toReanimated()).toEqual(springParams());
  });

  test("always sets the mass explicitly, because Reanimated would default it to 4", () => {
    expect(Object.keys(toReanimated({ stiffness: 100, damping: 10 })).sort()).toEqual(["damping", "mass", "stiffness"]);
    expect(toReanimated({ stiffness: 100, damping: 10 }).mass).toBe(1);
    expect(toReanimated({ duration: 0.4 }).mass).toBe(1);
  });

  test("is a valid physics-based withSpring config", () => {
    const config: WithSpringConfig = toReanimated({ duration: 0.4, bounce: 0.2 });
    expect(config).toEqual({
      stiffness: expect.any(Number),
      damping: expect.any(Number),
      mass: 1,
    });
  });

  test("ignores the rest thresholds, which withSpring does not expose", () => {
    expect(toReanimated({ duration: 0.4, restDelta: 0.5, restSpeed: 3 })).toEqual(springParams({ duration: 0.4 }));
  });

  test("throws the core RangeError for invalid options", () => {
    expect(() => toReanimated({ duration: -1 })).toThrow(RangeError);
    expect(() => toReanimated({ stiffness: 0, damping: 1 })).toThrow(RangeError);
  });
});
