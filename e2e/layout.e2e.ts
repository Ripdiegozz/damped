import { expect, test } from "@playwright/test";
import { MIN_FRAMES, TOLERANCE_PX, open } from "./helpers";

// The mutation must move the element by at least this much, or the checks below would prove nothing.
const MIN_TRAVEL_PX = 20;
// Edge positions are sub-pixel floats; this absorbs rounding noise without admitting a visible overshoot.
const MONOTONIC_SLACK_PX = 0.5;

for (const scenario of ["reorder", "resize"] as const) {
  test(`layout() starts on the previous box and settles on the new one (${scenario})`, async ({ page }) => {
    await open(page, "layout");

    const result = await page.evaluate(async (name) => {
      const { rect } = window.e2e;
      const element = document.getElementById(name === "reorder" ? "c" : "box")!;
      const before = rect(element);
      let natural = before;
      const mutate = () => {
        if (name === "reorder") document.getElementById("row")!.prepend(element);
        else element.classList.add("moved");
        natural = rect(element);
      };

      const controls = window.damped.layout(element, mutate, { bounce: 0 });
      const recording = window.e2e.record(() => rect(element));
      await controls.finished;
      recording.stop();
      return { before, natural, after: rect(element), samples: recording.samples.map((sample) => sample.value) };
    }, scenario);

    const { before, natural, after, samples } = result;
    expect(Math.abs(natural.x - before.x) + Math.abs(natural.y - before.y)).toBeGreaterThan(MIN_TRAVEL_PX);
    expect(samples.length).toBeGreaterThan(MIN_FRAMES);

    const first = samples[0]!;
    for (const key of ["x", "y", "width", "height"] as const) {
      expect(Math.abs(first[key] - before[key]), `first frame ${key}`).toBeLessThanOrEqual(TOLERANCE_PX);
      expect(Math.abs(after[key] - natural[key]), `final ${key}`).toBeLessThanOrEqual(TOLERANCE_PX);
    }

    // Bounce 0 and no inherited velocity: every edge approaches its target without overshooting or reversing.
    const edges = (box: typeof before) => ({ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height });
    const target = edges(natural);
    for (const edge of ["left", "top", "right", "bottom"] as const) {
      const distances = samples.map((sample) => Math.abs(edges(sample)[edge] - target[edge]));
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]!, `${edge} distance at frame ${i}`).toBeLessThanOrEqual(distances[i - 1]! + MONOTONIC_SLACK_PX);
      }
    }
  });
}

test("layout() with correct: children keeps the child at its natural size while the parent scales", async ({ page }) => {
  await open(page, "layout");

  const result = await page.evaluate(async () => {
    const { rect } = window.e2e;
    const parent = document.getElementById("parent")!;
    const child = document.getElementById("child")!;
    const childBefore = rect(child);
    const controls = window.damped.layout(parent, () => parent.classList.add("big"), {
      correct: "children",
      bounce: 0,
    });
    const recording = window.e2e.record(() => ({ parent: rect(parent), child: rect(child) }));
    await controls.finished;
    recording.stop();
    return { childBefore, parentAfter: rect(parent), samples: recording.samples.map((sample) => sample.value) };
  });

  const { childBefore, samples } = result;
  expect(childBefore.width).toBe(60);
  expect(samples.length).toBeGreaterThan(MIN_FRAMES);
  // The parent really did start at half size, so the child would be visibly squeezed without correction.
  expect(samples[0]!.parent.width).toBeCloseTo(100, 0);
  expect(samples.some((sample) => sample.parent.width < 150)).toBe(true);
  expect(result.parentAfter.width).toBeCloseTo(200, 0);

  for (const [index, sample] of samples.entries()) {
    expect(Math.abs(sample.child.width - childBefore.width), `child width at frame ${index}`).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(sample.child.height - childBefore.height), `child height at frame ${index}`).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
  }
});
