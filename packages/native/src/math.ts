// Worklet-safe spring math. This module must not import anything: worklets can only
// call other worklets, so every function here is self-contained and marked 'worklet'.

export type DampedSpringOptions =
  | { duration?: number; bounce?: number; restDelta?: number; restSpeed?: number }
  | { stiffness: number; damping: number; mass?: number; restDelta?: number; restSpeed?: number };

export interface DampedParams {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface DampedState {
  position: number;
  velocity: number;
}

export interface RestThresholds {
  restDelta: number;
  restSpeed: number;
}

const DEFAULT_DURATION = 0.5;
const DEFAULT_BOUNCE = 0.15;
const DEFAULT_REST_DELTA = 0.001;
const DEFAULT_REST_SPEED = 0.01;
const CRITICAL_TOLERANCE = 1e-6;

function assertFinite(name: string, value: number, valid: boolean, requirement: string): void {
  "worklet";
  if (!Number.isFinite(value) || !valid) {
    throw new RangeError(`${name} must be ${requirement}, received ${value}`);
  }
}

export function dampedRestThresholds(options?: { restDelta?: number; restSpeed?: number }): RestThresholds {
  "worklet";
  const restDelta = options?.restDelta ?? DEFAULT_REST_DELTA;
  const restSpeed = options?.restSpeed ?? DEFAULT_REST_SPEED;
  assertFinite("restDelta", restDelta, restDelta > 0, "a finite number greater than 0");
  assertFinite("restSpeed", restSpeed, restSpeed > 0, "a finite number greater than 0");
  return { restDelta, restSpeed };
}

export function dampedParams(options?: DampedSpringOptions): DampedParams {
  "worklet";
  dampedRestThresholds(options);

  if (options !== undefined && "stiffness" in options) {
    const { stiffness, damping, mass = 1 } = options;
    assertFinite("stiffness", stiffness, stiffness > 0, "a finite number greater than 0");
    assertFinite("damping", damping, damping >= 0, "a finite number greater than or equal to 0");
    assertFinite("mass", mass, mass > 0, "a finite number greater than 0");
    return { stiffness, damping, mass };
  }

  const duration = options?.duration ?? DEFAULT_DURATION;
  const bounce = options?.bounce ?? DEFAULT_BOUNCE;
  assertFinite("duration", duration, duration > 0, "a finite number greater than 0");
  assertFinite("bounce", bounce, bounce > -1 && bounce < 1, "a finite number between -1 and 1 (exclusive)");

  const omega = (2 * Math.PI) / duration;
  const ratio = bounce >= 0 ? 1 - bounce : 1 / (1 + bounce);
  return { stiffness: omega * omega, damping: 2 * ratio * omega, mass: 1 };
}

// Closed-form displacement from the target and velocity, `t` seconds after the spring
// started at displacement `x0` with velocity `v0`.
export function dampedState(x0: number, v0: number, params: DampedParams, t: number): DampedState {
  "worklet";
  if (!(t > 0)) return { position: x0, velocity: v0 };

  const { stiffness, damping, mass } = params;
  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (Math.abs(zeta - 1) < CRITICAL_TOLERANCE) {
    const b = v0 + omega0 * x0;
    const decay = Math.exp(-omega0 * t);
    return { position: decay * (x0 + b * t), velocity: decay * (v0 - omega0 * b * t) };
  }

  if (zeta < 1) {
    const sigma = zeta * omega0;
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const sinCoefficient = (v0 + sigma * x0) / omegaD;
    const velocitySinCoefficient = (omega0 * omega0 * x0 + sigma * v0) / omegaD;
    const decay = Math.exp(-sigma * t);
    const cos = Math.cos(omegaD * t);
    const sin = Math.sin(omegaD * t);
    return {
      position: decay * (x0 * cos + sinCoefficient * sin),
      velocity: decay * (v0 * cos - velocitySinCoefficient * sin),
    };
  }

  const root = Math.sqrt(zeta * zeta - 1);
  // r1 is the slow mode; r1 * r2 = omega0^2 avoids cancellation in (zeta - root) for large zeta.
  const r1 = -omega0 / (zeta + root);
  const r2 = -omega0 * (zeta + root);
  const c1 = (v0 - r2 * x0) / (r1 - r2);
  const c2 = x0 - c1;
  const e1 = Math.exp(r1 * t);
  const e2 = Math.exp(r2 * t);
  return { position: c1 * e1 + c2 * e2, velocity: r1 * c1 * e1 + r2 * c2 * e2 };
}

// Default values are applied in the body: the worklets plugin evaluates parameter defaults
// before it binds captured module constants, so a default may not read them.
export function isRest(displacement: number, velocity: number, restDelta?: number, restSpeed?: number): boolean {
  "worklet";
  return (
    Math.abs(displacement) <= (restDelta ?? DEFAULT_REST_DELTA) &&
    Math.abs(velocity) <= (restSpeed ?? DEFAULT_REST_SPEED)
  );
}
