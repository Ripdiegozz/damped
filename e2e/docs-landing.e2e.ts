import { expect, test } from "@playwright/test";
import { demo, expectRunAndSettle, recordPhases, watchProblems } from "./docs-helpers";

test("the landing page loads with no console errors or warnings and no failed request", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("momentum");
  // The three package cards and the hero action links.
  await expect(page.locator(".package-card")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/getting-started/");
  await expect(page.getByRole("link", { name: "Try the playground" })).toHaveAttribute("href", "/playground/");
  await demo(page, "morph-card");
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("the hero morph opens, reverses on Escape mid-flight and settles closed with focus back on the card", async ({ page }) => {
  await page.goto("/");
  const root = await demo(page, "morph-card");
  const card = root.locator(".morph-card");
  const dialog = root.locator(".morph-dialog");

  const phases = await recordPhases(root);
  await expectRunAndSettle(root, async () => {
    await card.click();
    // Mid-flight: it is animating and has not reached "open".
    await expect(root).toHaveAttribute("data-state", "animating");
    await page.keyboard.press("Escape");
  }, 2);
  expect(await phases()).toEqual(["closed", "opening", "closing", "closed"]);
  await expect(card).toHaveAttribute("aria-expanded", "false");
  await expect(card).toBeFocused();
  await expect(dialog).toBeHidden();
});

test("the hero morph opens fully when left alone, and the Close button closes it", async ({ page }) => {
  await page.goto("/");
  const root = await demo(page, "morph-card");
  await expectRunAndSettle(root, () => root.locator(".morph-card").click());
  await expect(root).toHaveAttribute("data-phase", "open");
  await expect(root.locator(".morph-dialog")).toBeVisible();
  await expectRunAndSettle(root, () => root.locator(".morph-dialog").getByRole("button", { name: "Close", exact: true }).click());
  await expect(root).toHaveAttribute("data-phase", "closed");
});
