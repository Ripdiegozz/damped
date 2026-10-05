import { describe, expect, test } from "bun:test";
import { laneOffset } from "../src/components/demos/SpringTuner";

const LANE = 360;
const TRAVEL = LANE - 24 - 2 * 10;

describe("laneOffset", () => {
  test("maps the settled endpoints to the lane edges", () => {
    expect(laneOffset(0, LANE)).toBe(0);
    expect(laneOffset(1, LANE)).toBe(TRAVEL);
  });

  test("clamps spring overshoot above 1 so the ball never leaves the lane", () => {
    expect(laneOffset(1.8, LANE)).toBe(TRAVEL);
  });

  test("clamps spring undershoot below 0 so the ball never leaves left", () => {
    expect(laneOffset(-0.3, LANE)).toBe(0);
  });

  test("a narrow lane collapses to zero instead of going negative", () => {
    expect(laneOffset(1, 20)).toBe(0);
    expect(laneOffset(0.5, 20)).toBe(0);
  });
});
