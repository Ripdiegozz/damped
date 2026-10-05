import { expect, test } from "@playwright/test";
import { watchProblems } from "./docs-helpers";

test("search finds the docs: typing 'spring' lists results that link to docs pages", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/");
  // Starlight's own search button opens the Pagefind dialog; the index is the one built into the site.
  await page.getByRole("button", { name: "Search" }).first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("search").getByRole("textbox");
  await expect(input).toBeFocused();
  await input.fill("spring");

  const results = dialog.locator("a[href]").filter({ hasText: /spring/i });
  await expect(results.first()).toBeVisible({ timeout: 10_000 });
  const hrefs = await results.evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));
  expect(hrefs.length).toBeGreaterThan(0);
  // The landing page and the docs are in the index; Northbook, which Pagefind never saw, is not.
  for (const href of hrefs) expect(href, "a result must point at a docs page").toMatch(/^\/(getting-started\/|guides\/|reference\/|$)/);
  expect(hrefs.some((href) => href !== "/"), "at least one result is a guide or reference page").toBe(true);

  // Following a result navigates to that page.
  const target = hrefs[0]!;
  await results.first().click();
  await expect(page).toHaveURL((url) => url.pathname === target);
  expect(problems).toEqual([]);
});

test("search shows an empty state for a query nothing matches", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search" }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.getByRole("search").getByRole("textbox").fill("zzzzqqqqxxxx");
  await expect(dialog).toContainText(/no results/i, { timeout: 10_000 });
});
