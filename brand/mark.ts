/**
 * The damped mark: the phase portrait of a damped oscillator. An even-weight Archimedean spiral that winds in and stops
 * clear of a separate rest dot. The spiral takes the ink colour and the rest dot is the only accent-coloured element.
 * Everything is laid out on a 32 x 32 grid.
 */

export interface SpiralParams {
  /** Radius where the spiral starts, in unscaled units. */
  r0: number;
  /** Radius lost per full turn. */
  pitch: number;
  turns: number;
  /** Start angle in radians; pi starts on the left. */
  start: number;
  /** Stroke weight, in unscaled units. */
  w: number;
  /** Rest dot radius, in unscaled units. */
  dot: number;
  /** Extent of the longest side of the bounding box, on the 32 grid. */
  size: number;
}

/** The approved master cut (explored as `5-hook-clear`). */
export const MASTER: SpiralParams = { r0: 12, pitch: 8.4, turns: 0.78, start: Math.PI, w: 3.5, dot: 2.4, size: 26 };

/** The cut for 16 to 32 px: heavier stroke, bigger dot, a shorter run and a wider pitch so the gap to the dot stays open. */
export const SMALL: SpiralParams = { r0: 12, pitch: 8.6, turns: 0.62, start: Math.PI, w: 4, dot: 2.8, size: 26 };

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface Mark {
  /** The spiral as one closed outline, round caps included. */
  d: string;
  start: Circle;
  end: Circle;
  /** The rest dot. */
  dot: Circle;
  /** Bounding box of the stroke and the dot, centred on (16, 16). */
  bounds: { x0: number; x1: number; y0: number; y1: number };
}

type Point = readonly [number, number];

const GRID_CENTRE = 16;
// Enough samples that the bounding box is exact to a few thousandths of a unit.
const BOUNDS_SAMPLES = 500;
// The outline is polygonal; at this count the chord error stays below 0.005 units on the 32 grid.
const OUTLINE_SAMPLES = 96;

// Mirrored vertically so the spiral opens upwards.
function centreline({ r0, pitch, turns, start }: SpiralParams, samples: number): Point[] {
  return Array.from({ length: samples }, (_, i) => {
    const t = (i / (samples - 1)) * turns * 2 * Math.PI;
    const r = r0 - (pitch * t) / (2 * Math.PI);
    return [r * Math.cos(start + t), r * Math.sin(start + t)];
  });
}

const round = (value: number) => Number(value.toFixed(2));

export function buildMark(params: SpiralParams): Mark {
  // Scale and centre the bounding box of the stroke and the dot (the dot sits at the origin) in the 32 grid.
  const dense = centreline(params, BOUNDS_SAMPLES);
  const pad = params.w / 2;
  const xs = [...dense.map(([x]) => x), -params.dot, params.dot];
  const ys = [...dense.map(([, y]) => y), -params.dot, params.dot];
  const [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const k = params.size / Math.max(x1 - x0, y1 - y0);
  const ox = GRID_CENTRE - ((x0 + x1) / 2) * k;
  const oy = GRID_CENTRE - ((y0 + y1) / 2) * k;
  const place = ([x, y]: Point): Point => [x * k + ox, y * k + oy];

  const line = centreline(params, OUTLINE_SAMPLES).map(place);
  const half = (params.w * k) / 2;
  const left: Point[] = [];
  const right: Point[] = [];
  line.forEach(([x, y], i) => {
    const [ax, ay] = line[Math.max(i - 1, 0)]!;
    const [bx, by] = line[Math.min(i + 1, line.length - 1)]!;
    const length = Math.hypot(bx - ax, by - ay);
    const nx = (-(by - ay) / length) * half;
    const ny = ((bx - ax) / length) * half;
    left.push([x + nx, y + ny]);
    right.push([x - nx, y - ny]);
  });

  const at = ([x, y]: Point) => `${round(x)} ${round(y)}`;
  const cap = `A${round(half)} ${round(half)} 0 0 0 `;
  // Down the left edge, a semicircle round the end, back up the right edge, a semicircle round the start.
  const d =
    `M${left.map(at).join("L")}${cap}${at(right[right.length - 1]!)}` +
    `L${[...right].reverse().map(at).join("L")}${cap}${at(left[0]!)}Z`;

  const [cx, cy] = place([0, 0]);
  const first = line[0]!;
  const last = line[line.length - 1]!;
  return {
    d,
    start: { cx: first[0], cy: first[1], r: half },
    end: { cx: last[0], cy: last[1], r: half },
    dot: { cx, cy, r: params.dot * k },
    bounds: { x0: x0 * k + ox, x1: x1 * k + ox, y0: y0 * k + oy, y1: y1 * k + oy },
  };
}
