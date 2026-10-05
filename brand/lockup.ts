import { buildMark, MASTER, type Mark } from "./mark";
import { type BoundingBox } from "opentype.js";
import { loadFont, outline, WORDMARK } from "./wordmark";

const WORD_SIZE = 32;
// The mark spans the word's ascender band with a touch of round overshoot, so it stands as tall as the d beside it.
const MARK_TO_ASCENDER = 1.04;
// Space between the mark and the word, in em of the word.
const GAP = 0.34;

export interface Lockup {
  width: number;
  height: number;
  mark: {
    /** Visible bounds of the mark in lockup space. */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Transform that maps the mark's 32 grid onto the lockup. */
    scale: number;
    translate: readonly [number, number];
    shapes: Mark;
  };
  word: { d: string; box: BoundingBox };
}

export function buildLockup(): Lockup {
  const font = loadFont(WORDMARK.weight);
  const options = { size: WORD_SIZE, tracking: WORDMARK.tracking };
  const ascender = -outline(font, "d", { ...options, x: 0, y: 0 }).box.y1;

  const shapes = buildMark(MASTER);
  const { x0, x1, y0, y1 } = shapes.bounds;
  const scale = (ascender * MARK_TO_ASCENDER) / (y1 - y0);
  const markWidth = (x1 - x0) * scale;
  const markHeight = (y1 - y0) * scale;

  // Lay out on the baseline at y = 0, centring the mark on the ascender band, then move everything to a zero origin.
  const first = outline(font, WORDMARK.text, { ...options, x: markWidth + GAP * WORD_SIZE, y: 0 });
  const markTop = -ascender / 2 - markHeight / 2;
  const top = Math.min(markTop, first.box.y1);
  const bottom = Math.max(markTop + markHeight, first.box.y2);
  const shiftY = -top;

  const word = outline(font, WORDMARK.text, { ...options, x: markWidth + GAP * WORD_SIZE, y: shiftY });
  return {
    width: word.box.x2,
    height: bottom - top,
    mark: {
      x: 0,
      y: markTop + shiftY,
      width: markWidth,
      height: markHeight,
      scale,
      translate: [-x0 * scale, (markTop + shiftY) - y0 * scale],
      shapes,
    },
    word,
  };
}
