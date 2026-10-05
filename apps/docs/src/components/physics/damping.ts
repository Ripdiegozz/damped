import { createSpring, type SpringOptions } from "@damped/core";
import type { Curve, SpringKind } from "../demos/spring-curve";

const CRITICAL_TOLERANCE = 1e-6;

/**
 * The damping ratio as a perceptual `bounce`: the inverse of the mapping `springParams` applies (`zeta = 1 - bounce`
 * for a positive bounce, `1 / (1 + bounce)` for a negative one). Driving the figures with `bounce` keeps them on the
 * public API instead of a private copy of the physics.
 */
export function bounceFromZeta(zeta: number): number {
  if (!Number.isFinite(zeta) || zeta <= 0) throw new RangeError(`zeta must be a finite number greater than 0, received ${zeta}`);
  return zeta <= 1 ? 1 - zeta : 1 / zeta - 1;
}

export function zetaFromBounce(bounce: number): number {
  if (!(bounce > -1 && bounce < 1)) throw new RangeError(`bounce must be between -1 and 1 (exclusive), received ${bounce}`);
  return bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
}

export function classifyDamping(zeta: number): SpringKind {
  if (Math.abs(zeta - 1) < CRITICAL_TOLERANCE) return "critically damped";
  return zeta < 1 ? "underdamped" : "overdamped";
}

/** The first overshoot of a spring that moves from 0 to 1, as a fraction of the move: `exp(-pi zeta / sqrt(1 - zeta^2))`. */
export function peakOvershoot(zeta: number): number {
  if (zeta >= 1 - CRITICAL_TOLERANCE) return 0;
  return Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));
}

export interface ResponseAxis {
  /** End of the time axis, in seconds. */
  tMax: number;
  samples: number;
  /** Vertical axis; fixed by the caller so the plot does not rescale while a slider moves. Defaults to the data. */
  yMin?: number;
  yMax?: number;
}

/**
 * Samples the position of a spring that moves from 0 to 1, analytically: `createSpring().at(t)` evaluates the closed
 * form, so no animation runs. Returns the shape `curvePath` and `plotScale` of the tuner already draw.
 */
export function sampleResponse(spring: SpringOptions, axis: ResponseAxis): Curve {
  if (!Number.isInteger(axis.samples) || axis.samples < 2) throw new RangeError(`samples must be an integer of at least 2, received ${axis.samples}`);
  const model = createSpring(0, 1, 0, spring);
  const points = Array.from({ length: axis.samples + 1 }, (_, index) => {
    const t = (index / axis.samples) * axis.tMax;
    return { t, x: model.at(t).position };
  });
  const values = points.map((point) => point.x);
  return {
    points,
    tMax: axis.tMax,
    yMin: axis.yMin ?? Math.min(0, ...values),
    yMax: axis.yMax ?? Math.max(1, ...values),
    settleTime: model.settleTime(),
  };
}
