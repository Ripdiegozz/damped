import { type Lockup, buildLockup } from "./lockup";
import { buildMark, MASTER, SMALL, type Mark, type SpiralParams } from "./mark";
import { palette } from "./tokens";

export type Cut = "master" | "small";
export type Theme = "dark" | "light";

const CUTS: Record<Cut, SpiralParams> = { master: MASTER, small: SMALL };
const NAMESPACE = 'xmlns="http://www.w3.org/2000/svg"';

/** Rounds to `digits` decimals and drops trailing zeros. */
export const num = (value: number, digits = 2) => String(Number(value.toFixed(digits)));

/** `inkAttribute` is the attribute that colours the spiral, such as `fill="#ededed"` or `class="ink"`. */
function shapes({ d, dot }: Mark, inkAttribute: string, accent: string): string {
  return `<path ${inkAttribute} d="${d}"/><circle cx="${num(dot.cx)}" cy="${num(dot.cy)}" r="${num(dot.r)}" fill="${accent}"/>`;
}

export interface MarkOptions {
  cut: Cut;
  /** A colour, `currentColor`, or `adaptive` for a mark that flips with the colour scheme (for use in an img). */
  ink: string;
}

/** The bare mark on the 32 grid: spiral in the ink colour, rest dot in the accent. */
export function markSvg({ cut, ink }: MarkOptions): string {
  const { accent, dark, light } = palette();
  const mark = buildMark(CUTS[cut]);
  const head = `<svg ${NAMESPACE} viewBox="0 0 32 32" width="32" height="32" fill="none"><title>damped</title>`;
  if (ink !== "adaptive") return `${head}${shapes(mark, `fill="${ink}"`, accent)}</svg>`;
  const style = `<style>.ink{fill:${light.ink}}@media (prefers-color-scheme:dark){.ink{fill:${dark.ink}}}</style>`;
  return `${head}${style}${shapes(mark, 'class="ink"', accent)}</svg>`;
}

export interface TileOptions {
  cut: Cut;
  /** Corner radius on the 32 grid; 0 for icons that the platform masks itself. */
  radius?: number;
  /** Extent of the mark on the 32 grid; the tile leaves room for its rounded corners. */
  size?: number;
}

/** A near-black tile with light ink, so one file works in light and dark browser chrome. */
export function tileSvg({ cut, radius = 7, size = 24 }: TileOptions): string {
  const { accent, dark } = palette();
  const mark = buildMark({ ...CUTS[cut], size });
  return (
    `<svg ${NAMESPACE} viewBox="0 0 32 32" width="32" height="32" fill="none"><title>damped</title>` +
    `<rect width="32" height="32" rx="${radius}" fill="${dark.paper}"/>${shapes(mark, `fill="${dark.ink}"`, accent)}</svg>`
  );
}

/** The mark and word as one group, drawn in a lockup's own coordinates. */
export function lockupBody(lockup: Lockup, theme: Theme): string {
  const { accent, ...colours } = palette();
  const ink = colours[theme].ink;
  const { scale, translate, shapes: mark } = lockup.mark;
  return (
    `<g transform="translate(${num(translate[0], 3)} ${num(translate[1], 3)}) scale(${num(scale, 4)})">${shapes(mark, `fill="${ink}"`, accent)}</g>` +
    `<path fill="${ink}" d="${lockup.word.d}"/>`
  );
}

/** Mark and wordmark side by side on a transparent background. `dark` means for dark surfaces, so the ink is light. */
export function lockupSvg(theme: Theme): string {
  const lockup = buildLockup();
  const [width, height] = [num(lockup.width), num(lockup.height)];
  return `<svg ${NAMESPACE} viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="none"><title>damped</title>${lockupBody(lockup, theme)}</svg>`;
}
