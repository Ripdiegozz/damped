export type SpringOptions =
  | { duration?: number; bounce?: number; restDelta?: number; restSpeed?: number }
  | { stiffness: number; damping: number; mass?: number; restDelta?: number; restSpeed?: number };

export interface SpringParams {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface SpringState {
  position: number;
  velocity: number;
}

export interface Spring {
  readonly from: number;
  readonly to: number;
  readonly velocity: number;
  readonly params: SpringParams;
  at(t: number): SpringState;
  isSettled(t: number): boolean;
  settleTime(): number;
}

const DEFAULT_DURATION = 0.5;
const DEFAULT_BOUNCE = 0.15;
const DEFAULT_REST_DELTA = 0.001;
const DEFAULT_REST_SPEED = 0.01;
const CRITICAL_TOLERANCE = 1e-6;
// Keeps settleTime() strictly on the settled side of the analytic bound despite rounding.
const SETTLE_MARGIN = 1e-9;

function assertFinite(name: string, value: number, valid: boolean, requirement: string): void {
  if (!Number.isFinite(value) || !valid) {
    throw new RangeError(`${name} must be ${requirement}, received ${value}`);
  }
}

function restThresholds(options: SpringOptions | undefined): { restDelta: number; restSpeed: number } {
  const restDelta = options?.restDelta ?? DEFAULT_REST_DELTA;
  const restSpeed = options?.restSpeed ?? DEFAULT_REST_SPEED;
  assertFinite("restDelta", restDelta, restDelta > 0, "a finite number greater than 0");
  assertFinite("restSpeed", restSpeed, restSpeed > 0, "a finite number greater than 0");
  return { restDelta, restSpeed };
}

export function springParams(options?: SpringOptions): SpringParams {
  restThresholds(options);

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

// Smallest T such that (a + c*t) * e^(-rate*t) <= threshold for every t >= T.
// ln(a + c*t) - rate*t is concave, so the envelope is unimodal and has one last crossing.
function lastCrossing(a: number, c: number, rate: number, threshold: number): number {
  const excess = (t: number) => Math.log(a + c * t) - rate * t - Math.log(threshold);
  const peak = c > 0 ? Math.max(0, (c - rate * a) / (rate * c)) : 0;
  if (!(excess(peak) > 0)) return 0;

  let lo = peak;
  let hi = peak + 1;
  while (excess(hi) >= 0) {
    lo = hi;
    hi *= 2;
  }
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (excess(mid) >= 0) lo = mid;
    else hi = mid;
  }
  return hi;
}

// Time for an envelope `amplitude * e^(-rate*t)` to fall below the thresholds.
function exponentialSettle(
  positionAmplitude: number,
  velocityAmplitude: number,
  rate: number,
  restDelta: number,
  restSpeed: number,
): number {
  const ratio = Math.max(positionAmplitude / restDelta, velocityAmplitude / restSpeed);
  if (ratio <= 1) return 0;
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  return Math.log(ratio * (1 + SETTLE_MARGIN)) / rate;
}

export function createSpring(from: number, to: number, velocity = 0, options?: SpringOptions): Spring {
  const params = springParams(options);
  const { restDelta, restSpeed } = restThresholds(options);
  const { stiffness, damping, mass } = params;

  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const x0 = from - to;
  const v0 = velocity;

  let displacement: (t: number) => SpringState;
  let settle: () => number;

  if (Math.abs(zeta - 1) < CRITICAL_TOLERANCE) {
    const b = v0 + omega0 * x0;
    displacement = (t) => {
      const decay = Math.exp(-omega0 * t);
      return { position: decay * (x0 + b * t), velocity: decay * (v0 - omega0 * b * t) };
    };
    settle = () =>
      Math.max(
        lastCrossing(Math.abs(x0), Math.abs(b), omega0, restDelta),
        lastCrossing(Math.abs(v0), omega0 * Math.abs(b), omega0, restSpeed),
      ) * (1 + SETTLE_MARGIN);
  } else if (zeta < 1) {
    const sigma = zeta * omega0;
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    const sinCoefficient = (v0 + sigma * x0) / omegaD;
    const velocitySinCoefficient = (omega0 * omega0 * x0 + sigma * v0) / omegaD;
    displacement = (t) => {
      const decay = Math.exp(-sigma * t);
      const cos = Math.cos(omegaD * t);
      const sin = Math.sin(omegaD * t);
      return {
        position: decay * (x0 * cos + sinCoefficient * sin),
        velocity: decay * (v0 * cos - velocitySinCoefficient * sin),
      };
    };
    settle = () =>
      exponentialSettle(
        Math.hypot(x0, sinCoefficient),
        Math.hypot(v0, velocitySinCoefficient),
        sigma,
        restDelta,
        restSpeed,
      );
  } else {
    const root = Math.sqrt(zeta * zeta - 1);
    // r1 is the slow mode; r1 * r2 = omega0^2 avoids cancellation in (zeta - root) for large zeta.
    const r1 = -omega0 / (zeta + root);
    const r2 = -omega0 * (zeta + root);
    const c1 = (v0 - r2 * x0) / (r1 - r2);
    const c2 = x0 - c1;
    displacement = (t) => {
      const e1 = Math.exp(r1 * t);
      const e2 = Math.exp(r2 * t);
      return { position: c1 * e1 + c2 * e2, velocity: r1 * c1 * e1 + r2 * c2 * e2 };
    };
    settle = () =>
      exponentialSettle(
        Math.abs(c1) + Math.abs(c2),
        Math.abs(r1 * c1) + Math.abs(r2 * c2),
        -r1,
        restDelta,
        restSpeed,
      );
  }

  let cachedSettleTime: number | undefined;
  const settleTime = (): number => (cachedSettleTime ??= settle());

  const at = (t: number): SpringState => {
    if (Number.isNaN(t)) throw new RangeError("time must not be NaN");
    if (!(t > 0)) return { position: from, velocity };
    if (t === Number.POSITIVE_INFINITY) {
      if (!Number.isFinite(settleTime())) {
        throw new RangeError("a spring that never settles has no state at infinite time");
      }
      return { position: to, velocity: 0 };
    }
    const state = displacement(t);
    state.position += to;
    return state;
  };

  const isSettled = (t: number): boolean => {
    const state = at(t);
    return Math.abs(state.position - to) <= restDelta && Math.abs(state.velocity) <= restSpeed;
  };

  return { from, to, velocity, params, at, isSettled, settleTime };
}
