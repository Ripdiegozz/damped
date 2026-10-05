import { expect, test, type Page } from "@playwright/test";
import { demo, expectRunAndSettle, recordPhases, runsOf, watchProblems } from "./docs-helpers";

const DEMOS = "/guides/demos/";

async function open(page: Page): Promise<string[]> {
  const problems = watchProblems(page);
  await page.goto(DEMOS);
  return problems;
}

test("retarget spring: two retargets while it moves are two runs, the velocity readout moves, then it settles", async ({ page }) => {
  const problems = await open(page);
  const root = await demo(page, "retarget-spring");
  const slider = root.getByRole("slider", { name: "Target position" });
  await slider.focus();
  await expectRunAndSettle(
    root,
    async () => {
      await page.keyboard.press("End");
      await expect(root).toHaveAttribute("data-state", "animating");
      // Retarget while the marker is still travelling: wait until the readout shows it has speed to carry.
      await expect(root.locator("dd").nth(1)).not.toHaveText("0 px/s");
      await page.keyboard.press("Home");
    },
    2,
  );
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await expect(root.locator(".demo-status")).toContainText("Velocity at the retarget");
  expect(problems).toEqual([]);
});

test("spring tuner: Replay animates and settles, and a slider change redraws the curve", async ({ page }) => {
  await open(page);
  const root = await demo(page, "spring-tuner");
  const curve = root.locator(".plot-curve");
  const before = await curve.getAttribute("d");
  await root.locator('input[type="range"]').first().fill("0.7");
  await expect.poll(() => curve.getAttribute("d")).not.toBe(before);
  await expectRunAndSettle(root, () => root.getByRole("button", { name: "Replay" }).click());
});

test("flip reorder: pressing buttons while the rows move keeps every row and settles on the last order", async ({ page }) => {
  await open(page);
  const root = await demo(page, "flip-reorder");
  const names = () => root.locator(".flip-name").allTextContents();
  const original = await names();
  await expectRunAndSettle(
    root,
    async () => {
      await root.getByRole("button", { name: "Shuffle" }).click();
      await root.getByRole("button", { name: "Sort by name" }).click();
    },
    2,
  );
  expect(await names()).toEqual([...original].sort());
  expect(await root.locator(".flip-row").count()).toBe(original.length);
  await expectRunAndSettle(root, () => root.getByRole("button", { name: "Reset" }).click());
  expect(await names()).toEqual(original);
});

test("morph card: opens, reverses on Escape mid-flight and ends closed, settled", async ({ page }) => {
  await open(page);
  const root = await demo(page, "morph-card");
  const phases = await recordPhases(root);
  await expectRunAndSettle(
    root,
    async () => {
      await root.locator(".morph-card").click();
      await expect(root).toHaveAttribute("data-state", "animating");
      await page.keyboard.press("Escape");
    },
    2,
  );
  // Reversed while opening: it never reached "open".
  expect(await phases()).toEqual(["closed", "opening", "closing", "closed"]);
  await expect(root.locator(".morph-card")).toBeFocused();
});

test("presence: adding a toast and removing one are one run each, and the removed toast is gone once it settles", async ({ page }) => {
  await open(page);
  const root = await demo(page, "presence");
  const toasts = root.locator(".toast");
  const start = await toasts.count();
  expect(await expectRunAndSettle(root, () => root.getByRole("button", { name: "Add a toast" }).click())).toBe(1);
  await expect(toasts).toHaveCount(start + 1);
  expect(await expectRunAndSettle(root, () => root.getByRole("button", { name: "Remove the newest" }).click())).toBe(1);
  await expect(toasts).toHaveCount(start);
  await expect(root.locator(".toast[inert]")).toHaveCount(0);
});

test("compositor vs JS: the compositor ball keeps a WAAPI animation and keeps drawing while the main thread is blocked", async ({ page }) => {
  await open(page);
  const root = await demo(page, "compositor-vs-js");
  const compositorBall = root.locator('[data-ball="compositor"]');
  const jsBall = root.locator('[data-ball="js"]');

  const session = await page.context().newCDPSession(page);
  const frames: { at: number; data: string }[] = [];
  session.on("Page.screencastFrame", (frame) => {
    frames.push({ at: performance.now(), data: frame.data });
    void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });

  await root.getByRole("button", { name: "Start" }).click();
  await expect(root).toHaveAttribute("data-state", "animating");
  // The compositor driver hands the browser a Web Animation; the default JS driver writes styles from frames.
  await expect.poll(() => compositorBall.evaluate((ball) => ball.getAnimations().length)).toBeGreaterThan(0);
  expect(await jsBall.evaluate((ball) => ball.getAnimations().length)).toBe(0);

  await root.getByRole("button", { name: "Block main thread (1 s)" }).click();
  // The attribute is written when the blocking loop ends, so it also marks the end of the window.
  await page.waitForFunction(() => document.querySelector('[data-demo="compositor-vs-js"]')?.hasAttribute("data-block-ms"));
  const blockEnd = performance.now();
  await session.send("Page.stopScreencast");

  expect(Number(await root.getAttribute("data-block-ms"))).toBeGreaterThanOrEqual(950);
  // The ball is mid-flight for the first part of the block (the spring takes about 1.3 s from its start).
  const during = frames.filter((frame) => frame.at > blockEnd - 950 && frame.at < blockEnd - 400);
  expect(during.length).toBeGreaterThanOrEqual(5);
  expect(new Set(during.map((frame) => frame.data)).size, "distinct frames drawn while the page was blocked").toBeGreaterThanOrEqual(5);
  await expect(root.locator(".demo-status")).toContainText("The compositor ball kept moving");

  // Stop ends the loop and the demo settles.
  const runs = await runsOf(root);
  expect(runs).toBeGreaterThan(0);
  await root.getByRole("button", { name: "Stop" }).click();
  await expect(root).toHaveAttribute("data-state", "settled", { timeout: 10_000 });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("every demo shows its note, and each one settles without travelling", async ({ page }) => {
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    const problems = await open(page);

    const notes = page.locator('.demo-note[role="note"]');
    // Hydration swaps the server markup for the client's, which is when each note appears.
    for (const name of ["retarget-spring", "spring-tuner", "flip-reorder", "morph-card", "presence", "compositor-vs-js"] as const) {
      const root = await demo(page, name);
      await expect(root.locator('.demo-note[role="note"]')).toContainText("Reduced motion is on");
    }
    await expect(notes).toHaveCount(6);

    // Retarget: the marker is at its destination immediately, not on its way.
    const retarget = await demo(page, "retarget-spring");
    await retarget.getByRole("slider").focus();
    await page.keyboard.press("End");
    await expect(retarget).toHaveAttribute("data-state", "settled", { timeout: 1000 });
    await expect(retarget.locator("dd").nth(1)).toHaveText("0 px/s");
    await expect(retarget.locator(".demo-status")).toContainText("jumped");

    // Tuner: Replay puts the ball at the end at once.
    const tuner = await demo(page, "spring-tuner");
    await expectRunAndSettle(tuner, () => tuner.getByRole("button", { name: "Replay" }).click());

    // Flip: the rows are already in their new places, with no transform left running.
    const flip = await demo(page, "flip-reorder");
    await expectRunAndSettle(flip, () => flip.getByRole("button", { name: "Sort by name" }).click());
    expect(await flip.locator(".flip-row").evaluateAll((rows) => rows.every((row) => row.getAnimations().length === 0))).toBe(true);

    // Morph: opens and closes; the geometry jumps while the crossfade stays.
    const morph = await demo(page, "morph-card");
    await expectRunAndSettle(morph, () => morph.locator(".morph-card").click());
    await expect(morph).toHaveAttribute("data-phase", "open");
    await expectRunAndSettle(morph, () => page.keyboard.press("Escape"));
    await expect(morph).toHaveAttribute("data-phase", "closed");

    // Presence: toasts come and go and the demo settles.
    const presence = await demo(page, "presence");
    await expectRunAndSettle(presence, () => presence.getByRole("button", { name: "Add a toast" }).click());
    await expectRunAndSettle(presence, () => presence.getByRole("button", { name: "Remove the newest" }).click());

    // Compositor: both balls jump, so the loop ends by itself and no Web Animation is left on the compositor ball.
    const compositor = await demo(page, "compositor-vs-js");
    await expectRunAndSettle(compositor, () => compositor.getByRole("button", { name: "Move" }).click());
    expect(await compositor.locator('[data-ball="compositor"]').evaluate((ball) => ball.getAnimations().length)).toBe(0);
    // The visitor can still opt in to the comparison.
    await compositor.getByRole("button", { name: "Play anyway" }).click();
    await expect(compositor.getByRole("button", { name: "Stop playing anyway" })).toBeVisible();

    expect(problems).toEqual([]);
  });

  test("the landing hero morph still opens and closes", async ({ page }) => {
    await page.goto("/");
    const root = await demo(page, "morph-card");
    await expectRunAndSettle(root, () => root.locator(".morph-card").click());
    await expect(root).toHaveAttribute("data-phase", "open");
  });
});
