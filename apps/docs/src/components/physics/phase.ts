import { createSpring, type SpringOptions, type SpringParams, type SpringState } from "@damped/core";

/** A point of the phase plane: position on x, velocity divided by the natural frequency on y (so both share a unit). */
export interface PhasePoint {
  x: number;
  y: number;
}

export interface TimedPhasePoint extends PhasePoint {
  t: number;
}

const naturalFrequency = ({ stiffness, mass }: Pick<SpringParams, "stiffness" | "mass">): number => Math.sqrt(stiffness / mass);

export function phasePoint(params: Pick<SpringParams, "stiffness" | "mass">, state: SpringState): PhasePoint {
  return { x: state.position, y: state.velocity / naturalFrequency(params) };
}

export interface PhaseSampling {
  samples: number;
  /** End of the path in seconds; defaults to the time the spring settles. */
  tMax?: number;
}

/**
 * The path a spring draws in the phase plane from `state` to rest on 0, sampled from the closed form. Dividing the
 * velocity by the natural frequency makes an undamped orbit a circle and a lightly damped one a tight spiral.
 */
export function samplePhase(options: SpringOptions, state: SpringState, { samples, tMax }: PhaseSampling): TimedPhasePoint[] {
  if (!Number.isInteger(samples) || samples < 1) throw new RangeError(`samples must be a positive integer, received ${samples}`);
  const spring = createSpring(state.position, 0, state.velocity, options);
  const end = tMax ?? spring.settleTime();
  return Array.from({ length: samples + 1 }, (_, index) => {
    const t = (index / samples) * end;
    return { t, ...phasePoint(spring.params, spring.at(t)) };
  });
}

export interface PhaseBox {
  width: number;
  height: number;
  padding: number;
}

export interface PhaseScale {
  x(value: number): number;
  y(value: number): number;
  /** Plot pixels back to the phase plane, clamped to the domain. */
  invert(px: number, py: number): PhasePoint;
  /** Half the extent of each axis, in phase units. */
  readonly domain: number;
}

/** The origin sits at the centre of the box; both axes span `-domain..domain`. */
export function phaseScale(box: PhaseBox, domain: number): PhaseScale {
  const centreX = box.width / 2;
  const centreY = box.height / 2;
  const halfX = centreX - box.padding;
  const halfY = centreY - box.padding;
  const clamp = (value: number): number => Math.min(1, Math.max(-1, value)) * domain;
  return {
    domain,
    x: (value) => centreX + (value / domain) * halfX,
    y: (value) => centreY - (value / domain) * halfY,
    invert: (px, py) => ({ x: clamp((px - centreX) / halfX ) + 0, y: clamp((centreY - py) / halfY) + 0 }),
  };
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** A polyline through `points` in the plot space of `scale`; empty for no points. */
export function phasePath(points: readonly PhasePoint[], scale: PhaseScale): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${round(scale.x(point.x))} ${round(scale.y(point.y))}`).join(" ");
}

export interface Trail {
  readonly size: number;
  push(point: PhasePoint): void;
  clear(): void;
  path(scale: PhaseScale): string;
}

/** The last `capacity` states a mass went through, drawn as one path. */
export function createTrail(capacity: number): Trail {
  let points: PhasePoint[] = [];
  return {
    get size() {
      return points.length;
    },
    push(point) {
      points.push(point);
      if (points.length > capacity) points = points.slice(points.length - capacity);
    },
    clear() {
      points = [];
    },
    path(scale) {
      return phasePath(points, scale);
    },
  };
}
