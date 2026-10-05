import { buildLockup } from "./lockup";
import { lockupBody, num } from "./svg";
import { palette } from "./tokens";
import { loadFont, outline } from "./wordmark";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const TAGLINE = ["Springs that keep", "their momentum."] as const;

const MARGIN = 88;
const LOCKUP_HEIGHT = 64;
const TAGLINE_SIZE = 84;
const TAGLINE_LEADING = 94;
const TAGLINE_TRACKING = -0.03;

/** A damped trace in phase space: the spiral winds in on the rest dot. Hairline, so it stays a texture. */
function trace(cx: number, cy: number, radius: number, turns: number): string {
  const samples = 480;
  const total = turns * 2 * Math.PI;
  const points = Array.from({ length: samples }, (_, i) => {
    const t = (i / (samples - 1)) * total;
    const r = radius * Math.exp((-t * 1.15) / (2 * Math.PI));
    return `${num(cx + r * Math.cos(Math.PI + t), 1)} ${num(cy + r * Math.sin(Math.PI + t), 1)}`;
  });
  return `M${points.join("L")}`;
}

/** The 1200 x 630 social card: the lockup, the tagline and a faint phase-space trace ending in the accent rest dot. */
export function ogSvg(): string {
  const { accent, dark } = palette();
  const lockup = buildLockup();
  const lockupScale = LOCKUP_HEIGHT / lockup.height;

  const font = loadFont("Medium");
  const lastBaseline = OG_SIZE.height - MARGIN - 8;
  const lines = TAGLINE.map((text, index) =>
    outline(font, text, {
      size: TAGLINE_SIZE,
      x: MARGIN - 4,
      y: lastBaseline - (TAGLINE.length - 1 - index) * TAGLINE_LEADING,
      tracking: TAGLINE_TRACKING,
    }).d,
  );

  const centre = { x: 950, y: 318 };
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${OG_SIZE.width} ${OG_SIZE.height}" width="${OG_SIZE.width}" height="${OG_SIZE.height}" fill="none">` +
    `<title>damped. ${TAGLINE.join(" ")}</title>` +
    `<rect width="${OG_SIZE.width}" height="${OG_SIZE.height}" fill="${dark.paper}"/>` +
    `<path d="${trace(centre.x, centre.y, 244, 3.1)}" stroke="${accent}" stroke-opacity=".38" stroke-width="2" stroke-linejoin="round"/>` +
    `<circle cx="${centre.x}" cy="${centre.y}" r="9" fill="${accent}"/>` +
    `<g transform="translate(${MARGIN} ${MARGIN}) scale(${num(lockupScale, 4)})">${lockupBody(lockup, "dark")}</g>` +
    `<path fill="${dark.ink}" d="${lines.join("")}"/>` +
    `</svg>`
  );
}
