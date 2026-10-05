import { describe, expect, test } from "bun:test";
import { DEFAULT_MOTION, MOTION_ROLES, SLOW_MOTION_FACTOR, effectiveReducedMotion, springFor, type MotionSettings } from "../src/motion";

const settings = (overrides: Partial<MotionSettings> = {}): MotionSettings => ({ ...DEFAULT_MOTION, ...overrides });

describe("springFor", () => {
  test("a morph follows the sliders: its duration is the duration and its bounce is the bounce", () => {
    const spring = springFor(settings({ duration: 0.8, bounce: 0.3 }), "morph");
    expect(spring.duration).toBeCloseTo(0.8, 6);
    expect(spring.bounce).toBeCloseTo(0.3, 6);
  });

  test("the duration scales every role in proportion", () => {
    for (const role of MOTION_ROLES) {
      const base = springFor(settings({ duration: 0.5 }), role).duration;
      expect(springFor(settings({ duration: 1 }), role).duration / base, role).toBeCloseTo(2, 2);
      expect(springFor(settings({ duration: 0.25 }), role).duration / base, role).toBeCloseTo(0.5, 2);
    }
  });

  test("slow motion multiplies the duration through the settings and by the extra factor of the query flag", () => {
    const normal = springFor(settings(), "panel").duration;
    expect(springFor(settings({ slowMotion: true }), "panel").duration / normal).toBeCloseTo(SLOW_MOTION_FACTOR, 2);
    expect(springFor(settings(), "panel", 3).duration / normal).toBeCloseTo(3, 2);
    expect(springFor(settings({ slowMotion: true }), "panel", 3).duration / normal).toBeCloseTo(3 * SLOW_MOTION_FACTOR, 2);
  });

  test("movement takes the bounce, and fades and counting numbers stay critically damped", () => {
    for (const role of ["view", "number", "row", "toast", "backdrop"] as const) {
      expect(springFor(settings({ bounce: 0.5 }), role).bounce, role).toBe(0);
    }
    for (const role of ["panel", "indicator", "morph", "stack", "progress", "badge"] as const) {
      expect(springFor(settings({ bounce: 0.5 }), role).bounce, role).toBeGreaterThanOrEqual(0.5);
      expect(springFor(settings({ bounce: 0 }), role).bounce, role).toBeLessThanOrEqual(0.4);
    }
  });

  test("bounce stays below 1 whatever the slider says", () => {
    for (const role of MOTION_ROLES) {
      const spring = springFor(settings({ bounce: 0.95 }), role);
      expect(spring.bounce, role).toBeLessThan(1);
      expect(spring.bounce, role).toBeGreaterThanOrEqual(0);
    }
  });

  test("every role is finite and positive across the slider range", () => {
    for (const duration of [0.1, 0.5, 2]) {
      for (const role of MOTION_ROLES) {
        const spring = springFor(settings({ duration, slowMotion: true }), role);
        expect(Number.isFinite(spring.duration) && spring.duration > 0, `${role} ${duration}`).toBe(true);
      }
    }
  });

  test("simulated reduced motion is passed on as reducedMotion: always, otherwise the key is absent", () => {
    expect(springFor(settings({ reducedMotion: true }), "morph").reducedMotion).toBe("always");
    expect("reducedMotion" in springFor(settings(), "morph")).toBe(false);
  });

  test("counting numbers get rest thresholds sized for dollars and cents", () => {
    const spring = springFor(settings(), "number");
    expect(spring.restDelta).toBeGreaterThan(0.01);
    expect(spring.restSpeed).toBeGreaterThan(0.1);
    expect("restDelta" in springFor(settings(), "morph")).toBe(false);
  });
});

describe("effectiveReducedMotion", () => {
  test("is on when the system asks for it or the lab simulates it", () => {
    expect(effectiveReducedMotion(settings(), false)).toBe(false);
    expect(effectiveReducedMotion(settings(), true)).toBe(true);
    expect(effectiveReducedMotion(settings({ reducedMotion: true }), false)).toBe(true);
  });
});

describe("DEFAULT_MOTION", () => {
  test("keeps the defaults of the sliders inside their ranges", () => {
    expect(DEFAULT_MOTION.duration).toBeGreaterThan(0.1);
    expect(DEFAULT_MOTION.duration).toBeLessThan(2);
    expect(DEFAULT_MOTION.bounce).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_MOTION.reducedMotion).toBe(false);
    expect(DEFAULT_MOTION.slowMotion).toBe(false);
  });
});
