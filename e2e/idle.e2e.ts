import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("no frames are requested once animate, layout and morph have all settled", async ({ page }) => {
  await open(page, "layout");

  const result = await page.evaluate(async () => {
    const { animate, layout, morph } = window.damped;
    const [a, b, c] = ["a", "b", "c"].map((id) => document.getElementById(id)!) as [HTMLElement, HTMLElement, HTMLElement];
    const box = document.getElementById("box")!;

    await Promise.all([
      animate(box, { x: 120, y: 40, scale: 1.2, rotate: 15, opacity: 0.5 }).finished,
      layout(c, () => document.getElementById("row")!.prepend(c)).finished,
      morph(a, b).finished,
    ]);

    const settled = window.e2e.frames();
    await window.e2e.sleep(500);
    return { settled, later: window.e2e.frames() };
  });

  expect(result.settled).toBeGreaterThan(5);
  expect(result.later).toBe(result.settled);
});
