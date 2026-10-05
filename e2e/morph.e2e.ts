import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const TOLERANCE = 1;

type Rect = ReturnType<Window["e2e"]["rect"]>;

function expectBox(actual: Rect, expected: Rect, label: string): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${label} ${key}: ${actual[key]} vs ${expected[key]}`).toBeLessThanOrEqual(
      TOLERANCE,
    );
  }
}

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
  expect(samples.length).toBeGreaterThan(5);
  expectBox(samples[0]!.modal, result.cardBox, "first frame");
  expectBox(result.modalAfter, result.modalBox, "final");
  expect(result.cardOpacityAfter).toBe(0);
  expect(result.modalOpacityAfter).toBe(1);

  // Two stacked layers with these opacities cover 1 - (1 - a)(1 - b) of what is behind them.
  const coverage = samples.map((sample) => 1 - (1 - sample.card) * (1 - sample.incoming));
  expect(Math.min(...coverage)).toBeGreaterThanOrEqual(0.85);
});

test("morph() reversed mid-flight keeps the modal moving smoothly and ends on the card", async ({ page }) => {
  await open(page, "morph");

  const result = await page.evaluate(async () => {
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
    const recording = window.e2e.record(center);
    await window.e2e.sleep(120);
    // Frames recorded so far show the forward morph; the next one shows the reversal.
    const reversalIndex = recording.samples.length;
    const backward = window.damped.morph(modal, card);

    const [first, second] = await Promise.all([forward.finished, backward.finished]);
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
  });

  const { centers, reversalIndex } = result;
  expect(result.first).toBe(false);
  expect(result.second).toBe(true);
  expect(reversalIndex).toBeGreaterThan(4);
  expect(centers.length).toBeGreaterThan(reversalIndex + 5);

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
  const before = distances.slice(reversalIndex - 4, reversalIndex - 1);
  const lastBefore = steps[reversalIndex - 2]!;
  const firstAfter = steps[reversalIndex - 1]!;
  const limit = 3 * Math.max(...before);

  expect(Math.max(...before)).toBeGreaterThan(1);
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
