export interface CoilShape {
  /** Half turns of the zigzag. */
  segments: number;
  /** Straight wire at each end, where the coil meets the wall and the mass. */
  lead: number;
  /** Length of the wire in one half turn. It does not change, so a stretched coil flattens like a real one. */
  wire: number;
  /** How far the zigzag may swing from the axis when the coil is squeezed. */
  maxAmplitude: number;
}

export const COIL: CoilShape = { segments: 10, lead: 12, wire: 32, maxAmplitude: 24 };

const round = (value: number): number => Math.round(value * 100) / 100;

/** Half height of the zigzag for a coil whose ends are `length` apart: the wire of one segment is the hypotenuse. */
export function coilAmplitude(length: number, shape: CoilShape = COIL): number {
  const run = Math.max(0, length - 2 * shape.lead) / shape.segments;
  const rise = Math.sqrt(Math.max(0, shape.wire * shape.wire - run * run));
  return Math.min(rise, shape.maxAmplitude);
}

/** The `d` of a coil between `x0` and `x1` on the line `y`: lead, a zigzag, lead. */
export function coilPath(x0: number, x1: number, y: number, shape: CoilShape = COIL): string {
  const amplitude = coilAmplitude(x1 - x0, shape);
  const start = x0 + shape.lead;
  const span = x1 - shape.lead - start;
  const points: [number, number][] = [
    [x0, y],
    [start, y],
    ...Array.from({ length: shape.segments }, (_, index): [number, number] => [
      start + ((index + 0.5) / shape.segments) * span,
      y + (index % 2 === 0 ? -amplitude : amplitude),
    ]),
    [x1 - shape.lead, y],
    [x1, y],
  ];
  return points.map(([x, py], index) => `${index === 0 ? "M" : "L"}${round(x)} ${round(py)}`).join(" ");
}
