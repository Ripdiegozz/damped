import { expect, test, type Page } from "@playwright/test";
import { TOLERANCE_PX, expectBox, navItem, openPlayground, settledBox } from "./playground-helpers";

test("the app loads with no console errors", async ({ page }) => {
  const problems = await openPlayground(page);
  await expect(page.getByText("Northbook").first()).toBeVisible();
  expect(problems).toEqual([]);
});

const EXPANDED_WIDTH_PX = 232;
const COLLAPSED_WIDTH_PX = 72;

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

// Overview. The figures are the app's initial data (apps/playground/src/data.ts).
const INITIAL_STATS = {
  balance: "$24,860.42",
  income: "$5,830.00",
  spent: "$2,364.18",
  savings: "$6,400.00",
} as const;
const INITIAL_PROGRESS = 0.64;
const PROGRESS_TOLERANCE = 0.005;

const statValue = (page: Page, stat: keyof typeof INITIAL_STATS) => page.locator(`[data-stat="${stat}"] .stat-value`);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** The horizontal scale of the progress fill, read from its computed transform. */
const fillScale = (page: Page) =>
  page.locator(".progress-fill").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return matrix.a;
  });

test("stat numbers end at their formatted target values", async ({ page }) => {
  await openPlayground(page);
  for (const [stat, text] of Object.entries(INITIAL_STATS)) {
    await expect(statValue(page, stat as keyof typeof INITIAL_STATS)).toHaveText(text);
  }
});

test("stat numbers count up from zero on the first view", async ({ page }) => {
  await openPlayground(page);
  await navItem(page, "Bills").click();
  await expect(page.locator('[data-view="overview"]')).toHaveCount(0);

  // Record every text the balance shows from the moment the Overview mounts.
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
  await expect(statValue(page, "balance")).toHaveText(INITIAL_STATS.balance);

  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen[0]).toBe("$0.00");
  expect(seen.length).toBeGreaterThan(5);
  expect(seen.at(-1)).toBe(INITIAL_STATS.balance);
});

test("the savings progress bar ends at the right scale", async ({ page }) => {
  await openPlayground(page);
  await expect.poll(() => fillScale(page).then((scale) => Math.abs(scale - INITIAL_PROGRESS))).toBeLessThan(PROGRESS_TOLERANCE);
  const origin = await page.locator(".progress-fill").evaluate((element) => getComputedStyle(element).transformOrigin);
  expect(origin.startsWith("0px")).toBe(true);
  await expect(page.getByRole("progressbar", { name: "Savings goal" })).toHaveAttribute("aria-valuenow", "64");
});

test("shuffling retargets the numbers and the bar, even when clicked repeatedly", async ({ page }) => {
  await openPlayground(page);
  await expect(statValue(page, "balance")).toHaveText(INITIAL_STATS.balance);

  const shuffle = page.getByRole("button", { name: "Shuffle data" });
  await shuffle.click();
  await shuffle.click();
  await shuffle.click();

  // The last click wins: every tile settles on the target the app reports for it.
  for (const stat of ["balance", "income", "spent", "savings"] as const) {
    const value = statValue(page, stat);
    const target = Number(await value.getAttribute("data-target"));
    expect(Number.isFinite(target)).toBe(true);
    await expect(value).toHaveText(currency.format(target));
  }
  await expect(statValue(page, "balance")).not.toHaveText(INITIAL_STATS.balance);

  const progress = Number(await page.locator(".progress-fill").getAttribute("data-progress"));
  await expect.poll(() => fillScale(page).then((scale) => Math.abs(scale - progress))).toBeLessThan(PROGRESS_TOLERANCE);
});

test("the shuffle button belongs to the Overview", async ({ page }) => {
  await openPlayground(page);
  await expect(page.getByRole("button", { name: "Shuffle data" })).toBeVisible();
  await navItem(page, "Bills").click();
  await expect(page.getByRole("button", { name: "Shuffle data" })).toHaveCount(0);
});

test("recent activity lists five rows with signed, colored amounts", async ({ page }) => {
  await openPlayground(page);
  const rows = page.getByRole("list", { name: "Recent activity" }).getByRole("listitem");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("Corner Grocery");

  const colors = await page.locator(".amount").evaluateAll((elements) =>
    elements.map((element) => ({
      positive: element.classList.contains("positive"),
      color: getComputedStyle(element).color,
      text: element.textContent ?? "",
    })),
  );
  expect(colors).toHaveLength(5);
  for (const { positive, color, text } of colors) {
    expect(text.startsWith(positive ? "+" : "-"), text).toBe(true);
    expect(color).toBe(positive ? "rgb(22, 138, 87)" : "rgb(196, 61, 61)");
  }
  // Every row ends fully opaque once its entrance settles.
  await expect
    .poll(() => rows.evaluateAll((items) => items.map((item) => Number(getComputedStyle(item).opacity))))
    .toEqual([1, 1, 1, 1, 1]);
});
