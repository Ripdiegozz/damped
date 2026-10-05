import { expect, test } from "@playwright/test";
import { MIN_FRAMES, expectBox, open } from "./helpers";

// Combined opacity of the two layers must never dip far enough for the page behind them to show through.
const MIN_COVERAGE = 0.85;
// The reverse morph is triggered once this many frames are recorded: about 120 ms at 60 fps, mid-flight, fast phase.
const REVERSAL_FRAME = 7;
// The displacements of this many frames before the reversal set the baseline speed.
const BASELINE_FRAMES = 3;
// A jump is a displacement beyond this multiple of the baseline; real frame timing makes single frames vary by far less.
const JUMP_FACTOR = 3;
// Frames that must be recorded after the reversal for it to be observed turning back and settling.
const MIN_FRAMES_AFTER_REVERSAL = 5;
// The baseline must be real motion, not sub-pixel noise from a modal that has barely started.
const MIN_BASELINE_PX = 1;

test("morph() starts the modal on the card, ends on its own box and keeps the crossfade covered", async ({ page }) => {
  await open(page, "morph");

  const result = await page.evaluate(async () => {
    const { rect } = window.e2e;
    const card = document.getElementById("card")!;
    const modal = document.getElementById("modal")!;
    const cardBox = rect(card);
    const modalBox = rect(modal);

    const controls = window.damped.morph(card, modal);
    const recording = window.e2e.record(() => ({
      modal: rect(modal),
      card: Number(getComputedStyle(card).opacity),
      incoming: Number(getComputedStyle(modal).opacity),
    }));
    const settled = await controls.finished;
    recording.stop();
    return {
      settled,
      cardBox,
      modalBox,
      modalAfter: rect(modal),
      cardOpacityAfter: Number(getComputedStyle(card).opacity),
      modalOpacityAfter: Number(getComputedStyle(modal).opacity),
      samples: recording.samples.map((sample) => sample.value),
    };
  });

  const { samples } = result;
  expect(result.settled).toBe(true);
  expect(samples.length).toBeGreaterThan(MIN_FRAMES);
  expectBox(samples[0]!.modal, result.cardBox, "first frame");
  expectBox(result.modalAfter, result.modalBox, "final");
  expect(result.cardOpacityAfter).toBe(0);
  expect(result.modalOpacityAfter).toBe(1);

  // Two stacked layers with these opacities cover 1 - (1 - a)(1 - b) of what is behind them.
  const coverage = samples.map((sample) => 1 - (1 - sample.card) * (1 - sample.incoming));
  expect(Math.min(...coverage)).toBeGreaterThanOrEqual(MIN_COVERAGE);
});

test("morph() reversed mid-flight keeps the modal moving smoothly and ends on the card", async ({ page }) => {
  await open(page, "morph");

  const result = await page.evaluate(async (reversalFrame) => {
    const { rect } = window.e2e;
    const card = document.getElementById("card")!;
    const modal = document.getElementById("modal")!;
    const center = () => {
      const box = rect(modal);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const cardBox = rect(card);
    const modalBox = rect(modal);

    const forward = window.damped.morph(card, modal);
    // Frame alignment: the recorder runs after the library's callback in every frame, so the sample just stored shows
    // what the library wrote this frame. Reversing right here, in the same callback and before the next frame, makes
    // the next frame (index `reversalFrame`) the first one that shows the reversal, whatever the real frame timing is.
    let backward = undefined as ReturnType<typeof window.damped.morph> | undefined;
    let reversalIndex = -1;
    const recording = window.e2e.record(center, (samples) => {
      if (samples.length !== reversalFrame) return;
      reversalIndex = samples.length;
      backward = window.damped.morph(modal, card);
    });

    // The forward morph resolves (false) as soon as the reversal supersedes it, so `backward` exists after this.
    const first = await forward.finished;
    const second = await backward!.finished;
    recording.stop();
    return {
      cardBox,
      modalBox,
      reversalIndex,
      first,
      second,
      modalAfter: rect(modal),
      cardAfter: rect(card),
      centers: recording.samples.map((sample) => sample.value),
    };
  }, REVERSAL_FRAME);

  const { centers, reversalIndex } = result;
  expect(result.first).toBe(false);
  expect(result.second).toBe(true);
  expect(reversalIndex).toBe(REVERSAL_FRAME);
  expect(centers.length).toBeGreaterThan(reversalIndex + MIN_FRAMES_AFTER_REVERSAL);

  // Signed progress of the modal's center along its forward path (card center to modal center).
  const start = { x: result.cardBox.x + result.cardBox.width / 2, y: result.cardBox.y + result.cardBox.height / 2 };
  const end = { x: result.modalBox.x + result.modalBox.width / 2, y: result.modalBox.y + result.modalBox.height / 2 };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const along = (point: { x: number; y: number }): number =>
    ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / length;

  const progress = centers.map(along);
  const steps = progress.slice(1).map((value, index) => value - progress[index]!);
  const distances = centers.slice(1).map((point, index) => Math.hypot(point.x - centers[index]!.x, point.y - centers[index]!.y));

  // Frame `reversalIndex` is the first one that shows the reversal; steps[i] and distances[i] lead into frame i + 1.
  const before = distances.slice(reversalIndex - 1 - BASELINE_FRAMES, reversalIndex - 1);
  const lastBefore = steps[reversalIndex - 2]!;
  const firstAfter = steps[reversalIndex - 1]!;
  const limit = JUMP_FACTOR * Math.max(...before);

  expect(Math.max(...before)).toBeGreaterThan(MIN_BASELINE_PX);
  expect(lastBefore).toBeGreaterThan(0);
  // Velocity continuity: it keeps moving forward for a moment before turning back.
  expect(Math.sign(firstAfter), `first post-reversal step ${firstAfter}`).toBe(Math.sign(lastBefore));
  for (let i = reversalIndex - 1; i < distances.length; i++) {
    expect(distances[i]!, `displacement into frame ${i + 1}`).toBeLessThanOrEqual(limit);
  }
  // ...and it does turn back afterwards.
  expect(Math.min(...steps.slice(reversalIndex - 1))).toBeLessThan(0);

  expectBox(result.modalAfter, result.cardBox, "modal at the end");
  expectBox(result.cardAfter, result.cardBox, "card at the end");
});
