import { createSpring, springParams } from "@damped/core";

export interface PerceptualSpring {
  bounce: number;
  duration: number;
}

export interface CurvePoint {
  t: number;
  x: number;
}

export interface Curve {
  points: CurvePoint[];
  /** End of the time axis in seconds: long enough for the spring to settle and for the nominal duration. */
  tMax: number;
  yMin: number;
  yMax: number;
  settleTime: number;
}

/**
 * Samples the position of a spring that goes from 0 to 1, analytically (no animation runs). The time axis ends a
 * little after the settle time so the flat tail is visible.
 */
export function sampleCurve(spring: PerceptualSpring, samples: number): Curve {
  if (!Number.isInteger(samples) || samples < 2) throw new RangeError(`samples must be an integer of at least 2, received ${samples}`);
  const model = createSpring(0, 1, 0, spring);
  const settleTime = model.settleTime();
  const tMax = Math.max(settleTime * 1.05, spring.duration * 1.05);
  const points: CurvePoint[] = [];
  let yMin = 0;
  let yMax = 1;
  for (let index = 0; index <= samples; index++) {
    const t = (index / samples) * tMax;
    const { position } = model.at(t);
    points.push({ t, x: position });
    yMin = Math.min(yMin, position);
    yMax = Math.max(yMax, position);
  }
  return { points, tMax, yMin, yMax, settleTime };
}

export interface PlotBox {
  width: number;
  height: number;
  padding: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** Maps a curve to the `d` of an SVG path inside `box`; the vertical axis grows upwards. */
export function curvePath(curve: Curve, box: PlotBox): string {
  const scale = plotScale(curve, box);
  return curve.points.map((point, index) => `${index === 0 ? "M" : "L"}${round(scale.x(point.t))} ${round(scale.y(point.x))}`).join(" ");
}

/** The same mapping curvePath() uses, for placing markers (the target line, the duration, the playhead). */
export function plotScale(curve: Curve, box: PlotBox): { x(t: number): number; y(value: number): number } {
  const innerWidth = box.width - 2 * box.padding;
  const innerHeight = box.height - 2 * box.padding;
  const span = curve.yMax - curve.yMin || 1;
  return {
    x: (t) => box.padding + (t / curve.tMax) * innerWidth,
    y: (value) => box.padding + (1 - (value - curve.yMin) / span) * innerHeight,
  };
}

export type SpringKind = "underdamped" | "critically damped" | "overdamped";

export interface SpringDescription {
  stiffness: number;
  damping: number;
  mass: number;
  settleTime: number;
  kind: SpringKind;
}

/** The physical parameters that the perceptual `bounce` and `duration` resolve to, and how long the spring takes to settle. */
export function describeSpring(spring: PerceptualSpring): SpringDescription {
  const { stiffness, damping, mass } = springParams(spring);
  const model = createSpring(0, 1, 0, spring);
  const ratio = damping / (2 * Math.sqrt(stiffness * mass));
  const kind: SpringKind = Math.abs(ratio - 1) < 1e-6 ? "critically damped" : ratio < 1 ? "underdamped" : "overdamped";
  return { stiffness, damping, mass, settleTime: model.settleTime(), kind };
}
