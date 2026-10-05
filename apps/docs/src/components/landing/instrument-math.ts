/*
 * The pure parts of the landing spring instrument: pointer mapping, release velocity, readout text and the two
 * traces it draws (position over time, and the phase portrait). No DOM, no clock: callers pass times in, so every
 * function is testable on its own.
 */

import { createSpring, type SpringOptions } from "@damped/core";

const MINUS = "−";
const round = (value: number): number => Math.round(value * 100) / 100;

/** Pointer x over a rail that starts at `left` and is `width` wide, as 0..100 and clamped to the rail. */
export function percentAt(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 50;
  return Math.min(100, Math.max(0, ((clientX - left) / width) * 100));
}

export interface VelocityTracker {
  push(time: number, value: number): void;
  /** Velocity in value units per second over the recent window; 0 when the pointer rested before `now`. */
  velocity(now: number): number;
  reset(): void;
}

/**
 * Release velocity from pointer samples. A least-squares slope over the last `windowMs` is steadier than the
 * difference of two samples, which pointer jitter dominates. A pointer that stopped moving `staleMs` before the
 * release carries nothing: the visitor held the mass still on purpose.
 */
export function createVelocityTracker(windowMs = 100, staleMs = 80): VelocityTracker {
  let samples: { time: number; value: number }[] = [];
  return {
    push(time, value) {
      samples.push({ time, value });
      const oldest = time - windowMs;
      if (samples.length > 2 && samples[0]!.time < oldest) samples = samples.filter((sample) => sample.time >= oldest);
    },
    velocity(now) {
      const recent = samples.filter((sample) => sample.time >= now - windowMs);
      const last = recent.at(-1);
      if (recent.length < 2 || last === undefined || now - last.time > staleMs) return 0;
      const meanTime = recent.reduce((sum, sample) => sum + sample.time, 0) / recent.length;
      const meanValue = recent.reduce((sum, sample) => sum + sample.value, 0) / recent.length;
      let covariance = 0;
      let variance = 0;
      for (const sample of recent) {
        covariance += (sample.time - meanTime) * (sample.value - meanValue);
        variance += (sample.time - meanTime) ** 2;
      }
      return variance === 0 ? 0 : (covariance / variance) * 1000;
    },
    reset() {
      samples = [];
    },
  };
}

/**
 * The instrument's spring, in track percent. Loose rest thresholds let it settle in about a second and a half
 * instead of chasing the last thousandth of a percent.
 */
export const SPRING = { duration: 0.9, bounce: 0.3, restDelta: 0.05, restSpeed: 0.5 } as const satisfies SpringOptions;

/** How far past either end of the track the mass may swing, in percent of the track. */
const OVERSHOOT = 5;

function swing(position: number, target: number, velocity: number): { low: number; high: number } {
  const spring = createSpring(position, target, velocity, SPRING);
  const end = spring.settleTime();
  let low = Math.min(position, target);
  let high = Math.max(position, target);
  for (let step = 0; step <= 160; step++) {
    const { position: at } = spring.at((end * step) / 160);
    low = Math.min(low, at);
    high = Math.max(high, at);
  }
  return { low, high };
}

/**
 * Release velocity that keeps the swing on the instrument. A hard flick away from the rest point would carry the
 * mass off the track; this returns the largest velocity in the same direction whose swing stays within
 * `OVERSHOOT` of the ends. Any velocity that already fits is returned as it is.
 */
export function limitVelocity(position: number, target: number, velocity: number): number {
  const fits = (candidate: number): boolean => {
    const { low, high } = swing(position, target, candidate);
    return low >= -OVERSHOOT && high <= 100 + OVERSHOOT;
  };
  if (velocity === 0 || fits(velocity)) return velocity;
  let fitting = 0;
  let tooMuch = 1;
  for (let step = 0; step < 14; step++) {
    const middle = (fitting + tooMuch) / 2;
    if (fits(velocity * middle)) fitting = middle;
    else tooMuch = middle;
  }
  return velocity * fitting;
}

/** The damping ratio of a spring: below 1 it overshoots, at 1 it is critically damped, above 1 it creeps. */
export function dampingRatio({ stiffness, damping, mass }: { stiffness: number; damping: number; mass: number }): number {
  return damping / (2 * Math.sqrt(stiffness * mass));
}

export const formatDamping = (ratio: number): string => ratio.toFixed(2);

/** "+12.3 px", "−8.0 px", "+0.0 px": a signed distance from the rest point, never a negative zero. */
export function formatDisplacement(pixels: number): string {
  const text = Math.abs(pixels).toFixed(1);
  return `${pixels < 0 && Number(text) !== 0 ? MINUS : "+"}${text} px`;
}

/**
 * One point of the phase portrait: how far the mass is from its rest point, and its velocity divided by the natural
 * frequency so both axes share a unit and an undamped spring would draw a circle.
 */
export function phasePoint(position: number, target: number, velocity: number, omega: number): { d: number; w: number } {
  return { d: position - target, w: omega > 0 ? velocity / omega : 0 };
}

export interface PositionTrail {
  readonly size: number;
  push(time: number, position: number): void;
  clear(): void;
  /** SVG path data, x being the position (0..100) and y the age of the sample over `height`, newest at the top. */
  path(height: number): string;
}

/**
 * Recent positions of the mass, drawn as a strip that hangs below the track: the newest sample on the track, older
 * ones further down. A gap longer than `gapMs` ends the stroke, so two separate runs never join with a false line.
 */
export function createPositionTrail(windowMs: number, gapMs: number): PositionTrail {
  let samples: { time: number; position: number }[] = [];
  return {
    get size() {
      return samples.length;
    },
    push(time, position) {
      samples.push({ time, position });
      const oldest = time - windowMs;
      let first = 0;
      // Keeps one sample before the window so the stroke reaches the bottom edge.
      while (first + 1 < samples.length && samples[first + 1]!.time <= oldest) first++;
      if (first > 0) samples = samples.slice(first);
    },
    clear() {
      samples = [];
    },
    path(height) {
      const newest = samples.at(-1);
      if (samples.length < 2 || newest === undefined) return "";
      const parts: string[] = [];
      let previous: number | undefined;
      for (let index = samples.length - 1; index >= 0; index--) {
        const sample = samples[index]!;
        const y = round(Math.min(height, ((newest.time - sample.time) / windowMs) * height));
        const stroke = previous === undefined || previous - sample.time > gapMs ? "M" : "L";
        parts.push(`${stroke}${round(sample.position)} ${y}`);
        previous = sample.time;
      }
      return parts.join(" ");
    },
  };
}

export interface PhaseView {
  /** Side of the square the portrait is drawn in. */
  size: number;
  /** The value (in track percent) that reaches the edge of the square. */
  extent: number;
}

export interface PhaseTrail {
  readonly size: number;
  push(d: number, w: number): void;
  clear(): void;
  path(view: PhaseView): string;
  head(view: PhaseView): { x: number; y: number } | undefined;
}

// Room left at the border so a point at the extent still shows its stroke.
const PHASE_MARGIN = 5;

/**
 * The phase portrait of the mass: displacement against velocity, the rest point at the centre and the velocity
 * pointing up. A retarget changes only the displacement of the next point, so the stroke crosses sideways and
 * keeps its height: the velocity survives the interruption.
 */
export function createPhaseTrail(maxPoints: number): PhaseTrail {
  let points: { d: number; w: number }[] = [];
  const toView = ({ d, w }: { d: number; w: number }, { size, extent }: PhaseView): { x: number; y: number } => {
    const scale = (size / 2 - PHASE_MARGIN) / extent;
    return { x: round(size / 2 + d * scale), y: round(size / 2 - w * scale) };
  };
  return {
    get size() {
      return points.length;
    },
    push(d, w) {
      points.push({ d, w });
      if (points.length > maxPoints) points = points.slice(points.length - maxPoints);
    },
    clear() {
      points = [];
    },
    path(view) {
      return points
        .map((point, index) => {
          const { x, y } = toView(point, view);
          return `${index === 0 ? "M" : "L"}${x} ${y}`;
        })
        .join(" ");
    },
    head(view) {
      const last = points.at(-1);
      return last === undefined ? undefined : toView(last, view);
    },
  };
}
