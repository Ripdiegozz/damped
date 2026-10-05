import { expect, test, type Page } from "@playwright/test";
import { navItem, openPlayground, settledBox } from "./playground-helpers";

const labButton = (page: Page) => page.getByRole("button", { name: "Spring lab" });
const lab = (page: Page) => page.locator("#spring-lab");
const durationSlider = (page: Page) => lab(page).getByLabel("Duration", { exact: true });
const bounceSlider = (page: Page) => lab(page).getByLabel("Bounce", { exact: true });
const slowSwitch = (page: Page) => lab(page).getByRole("switch", { name: /Slow motion/ });
const reducedSwitch = (page: Page) => lab(page).getByRole("switch", { name: /Simulate reduced motion/ });

async function openLab(page: Page, search = ""): Promise<void> {
  await openPlayground(page, search);
  await labButton(page).click();
  await expect(lab(page)).toBeVisible();
  await settledBox(lab(page));
}

/** Opens the Rent dialog from the page's own code and records its width on every frame until it is at rest. */
async function measureOpen(page: Page) {
  await navItem(page, "Bills").click();
  await expect(page.locator("[data-bill-card]")).toHaveCount(7);
  await settledBox(page.locator('[data-view="bills"]'));
  return page.evaluate(async () => {
    const card = document.querySelector<HTMLElement>('[data-bill-card="rent"]')!;
    const dialog = document.querySelector<HTMLElement>('[data-bill-dialog="rent"]')!;
    const started = performance.now();
    card.click();
    const samples: { at: number; width: number }[] = [];
    await new Promise<void>((resolve) => {
      let still = 0;
      const tick = (now: number) => {
        const width = dialog.getBoundingClientRect().width;
        const last = samples.at(-1);
        samples.push({ at: now - started, width });
        still = last !== undefined && Math.abs(width - last.width) < 0.02 ? still + 1 : 0;
        if (still >= 30) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const final = samples.at(-1)!.width;
    const lastMoving = samples.filter((sample) => Math.abs(sample.width - final) > 1).at(-1);
    return { samples, final, settleMs: lastMoving?.at ?? 0, peak: Math.max(...samples.map((sample) => sample.width)) };
  });
}

test("the Spring lab panel enters and leaves with Presence and shows the live values", async ({ page }) => {
  const problems = await openPlayground(page);
  await expect(lab(page)).toHaveCount(0);
  await expect(labButton(page)).toHaveAttribute("aria-expanded", "false");

  await labButton(page).click();
  await expect(labButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(lab(page)).toBeVisible();
  await expect(lab(page).locator("[data-lab-value=duration]")).toHaveText("0.50 s");
  await expect(lab(page).locator("[data-lab-value=bounce]")).toHaveText("0.10");

  // Screen readers get units with the values.
  await expect(durationSlider(page)).toHaveAttribute("aria-valuetext", "0.50 seconds");
  await expect(bounceSlider(page)).toHaveAttribute("aria-valuetext", "bounce 0.10");

  await durationSlider(page).fill("1.25");
  await bounceSlider(page).fill("0.35");
  await expect(durationSlider(page)).toHaveAttribute("aria-valuetext", "1.25 seconds");
  await expect(bounceSlider(page)).toHaveAttribute("aria-valuetext", "bounce 0.35");
  await expect(lab(page).locator("[data-lab-value=duration]")).toHaveText("1.25 s");
  await expect(lab(page).locator("[data-lab-value=bounce]")).toHaveText("0.35");

  await labButton(page).click();
  await expect(lab(page)).toHaveCount(0);
  await labButton(page).click();
  await expect(lab(page).locator("[data-lab-value=duration]")).toHaveText("1.25 s");

  await lab(page).getByRole("button", { name: "Reset" }).click();
  await expect(lab(page).locator("[data-lab-value=duration]")).toHaveText("0.50 s");
  expect(problems).toEqual([]);
});

test("the duration slider scales how long a morph takes", async ({ page }) => {
  await openLab(page);
  await durationSlider(page).fill("0.25");
  const quick = await measureOpen(page);

  await page.reload();
  await labButton(page).click();
  await durationSlider(page).fill("1");
  const slow = await measureOpen(page);

  expect(quick.settleMs).toBeGreaterThan(80);
  // Four times the duration is four times the time to settle: the same spring, stretched.
  expect(slow.settleMs / quick.settleMs).toBeGreaterThan(3.2);
  expect(slow.settleMs / quick.settleMs).toBeLessThan(4.8);
  expect(slow.final).toBeCloseTo(quick.final, 0);
});

test("the bounce slider decides whether a morph overshoots", async ({ page }) => {
  await openLab(page);
  await bounceSlider(page).fill("0");
  const flat = await measureOpen(page);
  expect(flat.peak - flat.final).toBeLessThanOrEqual(1);

  await page.reload();
  await labButton(page).click();
  await bounceSlider(page).fill("0.5");
  const springy = await measureOpen(page);
  expect(springy.peak - springy.final).toBeGreaterThan(3);
});

test("slow motion stretches every animation by the same factor", async ({ page }) => {
  await openLab(page);
  const normal = await measureOpen(page);

  await page.reload();
  await labButton(page).click();
  await slowSwitch(page).check();
  const slow = await measureOpen(page);
  expect(slow.settleMs / normal.settleMs).toBeGreaterThan(3.2);
  expect(slow.settleMs / normal.settleMs).toBeLessThan(4.8);
});

test("simulating reduced motion makes the morph jump to its final box", async ({ page }) => {
  await openLab(page);
  await reducedSwitch(page).check();
  const jumped = await measureOpen(page);
  // Every frame, the first one included, already has the dialog's final width.
  for (const sample of jumped.samples) expect(Math.abs(sample.width - jumped.final), `at ${sample.at.toFixed(0)} ms`).toBeLessThanOrEqual(1);
  expect(jumped.final).toBeGreaterThan(300);

  await page.reload();
  const animated = await measureOpen(page);
  expect(Math.abs(animated.samples[0]!.width - animated.final)).toBeGreaterThan(50);
});

test("simulated reduced motion also stops the counting numbers", async ({ page }) => {
  await openLab(page);
  await reducedSwitch(page).check();
  await navItem(page, "Bills").click();
  await expect(page.locator('[data-view="overview"]')).toHaveCount(0);
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    const stage = document.querySelector(".stage")!;
    new MutationObserver(() => {
      const text = stage.querySelector('[data-stat="balance"] .stat-value')?.textContent;
      if (text !== undefined && text !== null && seen.at(-1) !== text) seen.push(text);
    }).observe(stage, { subtree: true, childList: true, characterData: true });
  });
  await navItem(page, "Overview").click();
  await expect(page.locator('[data-stat="balance"] .stat-value')).toHaveText("$24,860.42");
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen.length).toBeLessThanOrEqual(2);
});

test("the lab reports the operating system's reduced-motion preference, read-only", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openLab(page);
  const system = lab(page).locator("[data-os-reduced]");
  await expect(system).toHaveText("No preference");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(system).toHaveText("Reduce");
  // It is a readout and not a control: the simulation switch is separate and stays off.
  await expect(reducedSwitch(page)).not.toBeChecked();
  expect(await system.evaluate((element) => element.closest("label, button, input") === null)).toBe(true);
});

test("on the compositor the dot keeps moving while the main thread is blocked; on the JS driver it freezes", async ({ page }) => {
  await openLab(page);
  const track = page.locator("[data-lab-track]");
  await settledBox(track);
  const geometry = await page.evaluate(() => {
    const box = (selector: string) => {
      const { left, top, width, height } = document.querySelector(selector)!.getBoundingClientRect();
      return { left, top, width, height };
    };
    return { track: box("[data-lab-track]"), compositor: box('[data-dot="compositor"]'), js: box('[data-dot="js"]') };
  });

  // The page's main thread is stuck, so only the browser's own composited frames can show whether a dot moved.
  const session = await page.context().newCDPSession(page);
  const frames: { at: number; data: string }[] = [];
  session.on("Page.screencastFrame", (frame) => {
    frames.push({ at: frame.metadata.timestamp! * 1000, data: frame.data });
    void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await lab(page).getByRole("button", { name: /Block main thread/ }).click();
  await page.waitForFunction(() => document.querySelector("[data-lab-track]")?.getAttribute("data-block-end") !== null);
  const { start, end } = await track.evaluate((element) => ({
    start: Number(element.getAttribute("data-block-start")),
    end: Number(element.getAttribute("data-block-end")),
  }));
  await page.waitForTimeout(300);
  await session.send("Page.stopScreencast");

  const EDGE_MS = 30;
  const during = frames.filter((frame) => frame.at > start + EDGE_MS && frame.at < end - EDGE_MS);
  expect(end - start).toBeGreaterThanOrEqual(300);
  expect(during.length).toBeGreaterThanOrEqual(5);

  const edges = await page.evaluate(
    async ({ images, rows, left, right }) => {
      const find = (data: Uint8ClampedArray, width: number, y: number, color: number[]): number => {
        for (let x = Math.floor(left); x < Math.ceil(right); x++) {
          const at = (y * width + x) * 4;
          if (Math.abs(data[at]! - color[0]!) + Math.abs(data[at + 1]! - color[1]!) + Math.abs(data[at + 2]! - color[2]!) < 40) return x;
        }
        return -1;
      };
      const result: { compositor: number; js: number }[] = [];
      for (const image of images) {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${image}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        const { data, width } = context.getImageData(0, 0, bitmap.width, bitmap.height);
        result.push({ compositor: find(data, width, rows.compositor, [22, 138, 87]), js: find(data, width, rows.js, [22, 24, 29]) });
      }
      return result;
    },
    {
      images: during.map((frame) => frame.data),
      rows: { compositor: Math.round(geometry.compositor.top + geometry.compositor.height / 2), js: Math.round(geometry.js.top + geometry.js.height / 2) },
      left: geometry.track.left,
      right: geometry.track.left + geometry.track.width,
    },
  );

  const compositorEdges = edges.map((edge) => edge.compositor);
  expect(compositorEdges.every((x) => x >= 0)).toBe(true);
  // Frame after frame the compositor dot moved on, never backwards...
  expect(new Set(compositorEdges).size).toBeGreaterThanOrEqual(5);
  expect(compositorEdges).toEqual([...compositorEdges].sort((a, b) => a - b));
  // ...while the identical spring on the JS driver stood still, so by the end of the block the compositor dot is ahead.
  expect(new Set(edges.map((edge) => edge.js)).size).toBe(1);
  expect(compositorEdges.at(-1)! - edges.at(-1)!.js).toBeGreaterThan(20);

  // Both end on the far side of the track, level with each other.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trackBox = document.querySelector("[data-lab-track]")!.getBoundingClientRect();
        const [a, b] = ["compositor", "js"].map((name) => trackBox.right - document.querySelector(`[data-dot="${name}"]`)!.getBoundingClientRect().right);
        return Math.abs(a! - b!) <= 1 && a! < 12;
      }),
    )
    .toBe(true);
});

test("the lab is reachable by keyboard", async ({ page }) => {
  await openPlayground(page);
  await labButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(lab(page)).toBeVisible();
  await durationSlider(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(lab(page).locator("[data-lab-value=duration]")).not.toHaveText("0.50 s");
});

const ANCHOR_GAP_PX = 8;

test("the lab opens as a popover under its button, right-aligned to it", async ({ page }) => {
  await openPlayground(page);
  await labButton(page).click();
  const panel = await settledBox(lab(page));
  const button = await settledBox(labButton(page));
  expect(Math.abs(panel.x + panel.width - (button.x + button.width))).toBeLessThanOrEqual(2);
  expect(Math.abs(panel.y - (button.y + button.height + ANCHOR_GAP_PX))).toBeLessThanOrEqual(2);
  // It fits under the button: its bottom stays inside the window.
  expect(panel.y + panel.height).toBeLessThanOrEqual(800);
});

test("on a narrow screen the popover stays inside the viewport, still under the button", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await openPlayground(page);
  await labButton(page).click();
  const panel = await settledBox(lab(page));
  const button = await settledBox(labButton(page));
  expect(panel.x).toBeGreaterThanOrEqual(6);
  expect(panel.x + panel.width).toBeLessThanOrEqual(420 - 6);
  expect(panel.y).toBeGreaterThanOrEqual(button.y + button.height);
  expect(panel.y + panel.height).toBeLessThanOrEqual(800);
});

test("the popover enters from the button side", async ({ page }) => {
  await openPlayground(page);
  const tops = await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('button[aria-controls="spring-lab"]')!.click();
    const samples: number[] = [];
    await new Promise<void>((resolve) => {
      let still = 0;
      const tick = () => {
        const panel = document.getElementById("spring-lab");
        if (panel !== null) {
          const top = panel.getBoundingClientRect().top;
          still = samples.length > 0 && Math.abs(top - samples.at(-1)!) < 0.01 ? still + 1 : 0;
          samples.push(top);
        }
        if (still >= 20) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return samples;
  });
  // It starts a few pixels toward the button (above its place) and settles down into it.
  expect(tops[0]!).toBeLessThan(tops.at(-1)! - 3);
});

test("Escape closes the popover and returns focus to the button; so does a click outside", async ({ page }) => {
  await openPlayground(page);
  await labButton(page).click();
  await expect(lab(page)).toBeVisible();
  // Focus moves into the popover when it opens.
  await expect(durationSlider(page)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(lab(page)).toHaveCount(0);
  await expect(labButton(page)).toBeFocused();
  await expect(labButton(page)).toHaveAttribute("aria-expanded", "false");

  await labButton(page).click();
  await expect(lab(page)).toBeVisible();
  await page.mouse.click(300, 600);
  await expect(lab(page)).toHaveCount(0);

  // Clicking the button itself while it is open closes it once, rather than closing and reopening it.
  await labButton(page).click();
  await expect(lab(page)).toBeVisible();
  await labButton(page).click();
  await expect(lab(page)).toHaveCount(0);
});

test("using the controls inside the popover does not close it", async ({ page }) => {
  await openPlayground(page);
  await labButton(page).click();
  await durationSlider(page).fill("0.75");
  await slowSwitch(page).check();
  await lab(page).getByRole("button", { name: "Reset" }).click();
  await expect(lab(page)).toBeVisible();
});
