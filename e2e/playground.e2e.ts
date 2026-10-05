import { expect, test, type Locator, type Page } from "@playwright/test";

const PLAYGROUND = "/playground/";

/** Opens the built playground and records everything the page reports as an error. */
async function openPlayground(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`requestfailed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });
  await page.goto(PLAYGROUND);
  return problems;
}

test("the app loads with no console errors", async ({ page }) => {
  const problems = await openPlayground(page);
  await expect(page.getByText("Northbook").first()).toBeVisible();
  expect(problems).toEqual([]);
});

const EXPANDED_WIDTH_PX = 232;
const COLLAPSED_WIDTH_PX = 72;
/** Rects are compared to sub-pixel layout noise: 1 px is below anything a user could see as a misplacement. */
const TOLERANCE_PX = 1;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resolves with the element's final box once it has not moved for a few frames, i.e. its animation settled. */
async function settledBox(locator: Locator): Promise<Box> {
  return locator.evaluate(
    (element) =>
      new Promise<Box>((resolve, reject) => {
        const read = (): Box => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return { x, y, width, height };
        };
        const STILL_FRAMES = 20;
        const deadline = performance.now() + 5000;
        let last = read();
        let still = 0;
        const tick = () => {
          const now = read();
          const moved = (["x", "y", "width", "height"] as const).some((key) => Math.abs(now[key] - last[key]) > 0.01);
          still = moved ? 0 : still + 1;
          last = now;
          if (still >= STILL_FRAMES) resolve(now);
          else if (performance.now() > deadline) reject(new Error("the element never settled"));
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

function expectBox(actual: Box, expected: Box, label: string): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${label} ${key}: ${actual[key]} vs ${expected[key]}`).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
  }
}

const navItem = (page: Page, name: string) => page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name });

test("the sidebar collapses and expands to the exact widths", async ({ page }) => {
  await openPlayground(page);
  const sidebar = page.locator("#sidebar");
  const toggle = page.getByRole("button", { name: "Toggle sidebar" });

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect((await settledBox(sidebar)).width).toBeCloseTo(EXPANDED_WIDTH_PX, 0);
  await expect(page.locator(".nav-label").first()).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const collapsed = await settledBox(sidebar);
  expect(Math.abs(collapsed.width - COLLAPSED_WIDTH_PX)).toBeLessThanOrEqual(TOLERANCE_PX);
  await expect(page.locator(".nav-label").first()).toBeHidden();
  // The buttons keep their accessible names without the visible labels.
  await expect(navItem(page, "Bills")).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const expanded = await settledBox(sidebar);
  expect(Math.abs(expanded.width - EXPANDED_WIDTH_PX)).toBeLessThanOrEqual(TOLERANCE_PX);
  await expect(page.locator(".nav-label").first()).toBeVisible();
});

test("the nav indicator ends aligned with the active item", async ({ page }) => {
  await openPlayground(page);
  const indicator = page.locator(".nav-indicator");

  expectBox(await settledBox(indicator), await settledBox(navItem(page, "Overview")), "initial indicator");

  for (const name of ["Activity", "Bills", "Settings"]) {
    await navItem(page, name).click();
    await expect(navItem(page, name)).toHaveAttribute("aria-current", "page");
    expectBox(await settledBox(indicator), await settledBox(navItem(page, name)), `indicator on ${name}`);
  }

  // Clicking again while the indicator is still travelling must not strand it.
  await navItem(page, "Overview").click();
  await navItem(page, "Activity").click();
  await navItem(page, "Bills").click();
  expectBox(await settledBox(indicator), await settledBox(navItem(page, "Bills")), "indicator after rapid clicks");

  // And it follows the item through a sidebar resize.
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  await settledBox(page.locator("#sidebar"));
  expectBox(await settledBox(indicator), await settledBox(navItem(page, "Bills")), "indicator in a collapsed sidebar");
});

test("switching views shows the new view and removes the old one once its exit settles", async ({ page }) => {
  await openPlayground(page);
  await expect(page.locator('[data-view="overview"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");

  await navItem(page, "Bills").click();
  await expect(page.locator('[data-view="bills"]')).toBeVisible();
  await expect(page.locator('[data-view="overview"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bills");
  await expect(navItem(page, "Overview")).not.toHaveAttribute("aria-current", "page");

  await navItem(page, "Settings").click();
  await expect(page.locator('[data-view="settings"]')).toBeVisible();
  await expect(page.locator("[data-view]")).toHaveCount(1);
});

test("the skip link moves focus to the main content", async ({ page }) => {
  await openPlayground(page);
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

test("keyboard users reach the nav buttons and see where focus is", async ({ page }) => {
  await openPlayground(page);
  const bills = navItem(page, "Bills");
  await bills.focus();
  await page.keyboard.press("Enter");
  await expect(bills).toHaveAttribute("aria-current", "page");
  const outline = await bills.evaluate((element) => {
    const { outlineStyle, outlineWidth } = getComputedStyle(element);
    return { outlineStyle, outlineWidth: Number.parseFloat(outlineWidth) };
  });
  expect(outline.outlineStyle).not.toBe("none");
  expect(outline.outlineWidth).toBeGreaterThanOrEqual(2);
});
