// Pure helpers behind scripts/record-demo.ts: a pointer path that looks like a hand, and a seeded random sequence so
// the recording is the same every time. Kept apart so they can be tested.

export interface Point {
  x: number;
  y: number;
}

/** A small seeded generator: the same seed gives the same values in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A value between `min` (inclusive) and `max` (exclusive) from a unit random source. */
export const between = (random: () => number, min: number, max: number): number => min + random() * (max - min);

/** Slow start, fast middle, slow end. */
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const MIN_GLIDE_MS = 450;
const MAX_GLIDE_MS = 900;
/** Distance in pixels at which a glide takes the longest. */
const LONG_DISTANCE_PX = 1000;

/** How long a pointer move takes: 450 ms for a short one, up to 900 ms for a long one. */
export const glideDuration = (distance: number): number =>
  Math.round(MIN_GLIDE_MS + (MAX_GLIDE_MS - MIN_GLIDE_MS) * Math.min(distance / LONG_DISTANCE_PX, 1));

const cubic = (a: number, b: number, c: number, d: number, t: number): number =>
  (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;

/**
 * The points a pointer passes through from `from` to `to`: a gentle cubic Bézier that bows to one side, walked with
 * an ease-in-out speed. The last point is exactly `to`.
 */
export function cursorPath(from: Point, to: Point, random: () => number, steps: number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return Array.from({ length: steps }, () => ({ ...to }));

  // Control points a third and two thirds of the way, pushed sideways by a share of the distance. Both push the same
  // way, so the path bows like an arm moving, instead of wobbling.
  const side = random() < 0.5 ? -1 : 1;
  const first = side * distance * between(random, 0.06, 0.14);
  const second = side * distance * between(random, 0.04, 0.12);
  const normal = { x: -dy / distance, y: dx / distance };
  const c1 = { x: from.x + dx / 3 + normal.x * first, y: from.y + dy / 3 + normal.y * first };
  const c2 = { x: from.x + (2 * dx) / 3 + normal.x * second, y: from.y + (2 * dy) / 3 + normal.y * second };

  const path: Point[] = [];
  for (let step = 1; step <= steps; step++) {
    const t = easeInOut(step / steps);
    path.push({ x: cubic(from.x, c1.x, c2.x, to.x, t), y: cubic(from.y, c1.y, c2.y, to.y, t) });
  }
  path[steps - 1] = { ...to };
  return path;
}
