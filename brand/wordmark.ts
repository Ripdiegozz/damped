import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type BoundingBox, type Font, parse, type PathCommand } from "opentype.js";

/** The wordmark: lowercase, Geist SemiBold, tracking a touch tighter than the font's default. */
export const WORDMARK = { text: "damped", weight: "SemiBold", tracking: -0.025 } as const;

export type Weight = "Regular" | "Medium" | "SemiBold";

// geist is OFL licensed and a devDependency: the font is only read here, to turn text into outlines.
const FONT_DIR = join(import.meta.dir, "../node_modules/geist/dist/fonts/geist-sans");

const fonts = new Map<Weight, Font>();

export function loadFont(weight: Weight): Font {
  let font = fonts.get(weight);
  if (!font) {
    const bytes = readFileSync(join(FONT_DIR, `Geist-${weight}.ttf`));
    font = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    fonts.set(weight, font);
  }
  return font;
}

export interface Outline {
  /** Path data in SVG space (y down, baseline at the requested y). */
  d: string;
  box: BoundingBox;
}

export interface OutlineOptions {
  size: number;
  x: number;
  y: number;
  /** Extra space after every glyph, in em. */
  tracking: number;
}

const round = (value: number) => Number(value.toFixed(2));

// opentype's own toPathData flips y twice by default, caches roundings in a way that yields NaN, and pads zeros, so the
// path data is written from the raw commands instead.
function pathData(commands: readonly PathCommand[]): string {
  let d = "";
  let x = NaN;
  let y = NaN;
  for (const command of commands) {
    if (command.type === "Z") {
      d += "Z";
      continue;
    }
    // TrueType conversion repeats the starting point as a zero-length line.
    if (command.type === "L" && round(command.x) === x && round(command.y) === y) continue;
    const coordinates =
      command.type === "C" ? [command.x1, command.y1, command.x2, command.y2, command.x, command.y]
      : command.type === "Q" ? [command.x1, command.y1, command.x, command.y]
      : [command.x, command.y];
    d += command.type + coordinates.map(round).join(" ");
    x = round(command.x);
    y = round(command.y);
  }
  return d.replace(/ -/g, "-");
}

export function outline(font: Font, text: string, { size, x, y, tracking }: OutlineOptions): Outline {
  const path = font.getPath(text, x, y, size, { kerning: true, letterSpacing: tracking });
  return { d: pathData(path.commands), box: path.getBoundingBox() };
}
