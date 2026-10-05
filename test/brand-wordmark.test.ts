import { expect, test } from "bun:test";
import { buildLockup } from "../brand/lockup";
import { loadFont, outline, WORDMARK } from "../brand/wordmark";

const semibold = loadFont("SemiBold");

test("outlines text as plain path data, with no font reference left", () => {
  const { d } = outline(semibold, "damped", { size: 100, x: 0, y: 0, tracking: 0 });
  expect(d.startsWith("M")).toBe(true);
  expect(d).toMatch(/^[MLCQZ\d. -]+$/);
  expect(d).not.toMatch(/\d\.\d{3,}/);
  expect(d).not.toMatch(/\.0+(?!\d)/);
});

test("anchors the baseline at y and the left origin at x", () => {
  const { box } = outline(semibold, "damped", { size: 100, x: 40, y: 200, tracking: 0 });
  expect(box.x1).toBeGreaterThan(40);
  expect(box.x1).toBeLessThan(50);
  expect(box.y1).toBeLessThan(200 - 70); // the ascender of the d
  expect(box.y2).toBeGreaterThan(200); // the descender of the p
});

test("tight tracking narrows the word by the tracking times the gaps between letters", () => {
  const plain = outline(semibold, "damped", { size: 100, x: 0, y: 0, tracking: 0 });
  const tight = outline(semibold, "damped", { size: 100, x: 0, y: 0, tracking: -0.03 });
  const width = (box: { x1: number; x2: number }) => box.x2 - box.x1;
  expect(width(plain.box) - width(tight.box)).toBeCloseTo(5 * 3, 0);
});

test("the wordmark is lowercase damped in Geist SemiBold with slightly tight tracking", () => {
  expect(WORDMARK).toEqual({ text: "damped", weight: "SemiBold", tracking: expect.any(Number) });
  expect(WORDMARK.tracking).toBeLessThan(0);
  expect(WORDMARK.tracking).toBeGreaterThanOrEqual(-0.03);
});

test("the lockup sits on a zero origin with the mark clear of the word", () => {
  const lockup = buildLockup();
  expect(lockup.mark.x).toBeCloseTo(0, 1);
  expect(lockup.width).toBeGreaterThan(lockup.height * 3);
  expect(lockup.word.box.x1 - (lockup.mark.x + lockup.mark.width)).toBeGreaterThan(lockup.height * 0.15);
  expect(Math.min(lockup.mark.y, lockup.word.box.y1)).toBeCloseTo(0, 1);
  expect(Math.max(lockup.mark.y + lockup.mark.height, lockup.word.box.y2)).toBeCloseTo(lockup.height, 1);
  expect(lockup.word.box.x2).toBeCloseTo(lockup.width, 1);
});
