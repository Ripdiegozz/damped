import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("animate() moves the element to the target and then requests no more frames", async ({ page }) => {
  await open(page, "animate");

  const result = await page.evaluate(async () => {
    const box = document.getElementById("box")!;
    const idleBefore = window.e2e.frames();
    await window.damped.animate(box, { x: 200 }).finished;

    const matrix = new DOMMatrix(getComputedStyle(box).transform);
    const rect = window.e2e.rect(box);
    const settled = window.e2e.frames();
    await window.e2e.sleep(400);
    return { idleBefore, matrix: { x: matrix.m41, y: matrix.m42 }, left: rect.x, settled, later: window.e2e.frames() };
  });

  expect(result.idleBefore).toBe(0);
  expect(result.matrix).toEqual({ x: 200, y: 0 });
  expect(result.left).toBeCloseTo(220, 1);
  expect(result.settled).toBeGreaterThan(5);
  expect(result.later).toBe(result.settled);
});

test("animate() under reduced motion jumps spatial properties on the first frame and still animates opacity", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "animate");

  const { frames, finalOpacity } = await page.evaluate(async () => {
    const box = document.getElementById("box")!;
    const read = () => ({
      x: new DOMMatrix(getComputedStyle(box).transform).m41,
      opacity: Number(getComputedStyle(box).opacity),
    });
    const controls = window.damped.animate(box, { x: 100, opacity: 0 });
    const recording = window.e2e.record(read);
    await controls.finished;
    recording.stop();
    return { frames: recording.samples.map((sample) => sample.value), finalOpacity: read().opacity };
  });

  const first = frames[0]!;
  expect(first.x).toBe(100);
  // The first frame is t = 0 of the opacity spring: it has started, but has not jumped to the target.
  expect(first.opacity).toBeGreaterThan(0);
  expect(first.opacity).toBeLessThanOrEqual(1);
  expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
  expect(frames.every((frame) => frame.x === 100)).toBe(true);
  expect(finalOpacity).toBe(0);
});
