import { expect, test } from "@playwright/test";
import { watchProblems } from "./docs-helpers";

// The playground is built with relative asset URLs, so it works under /playground/ as well as at a domain root.
// This is the proof, on the assembled site: every request it makes stays under the sub-path and succeeds.
test("Northbook loads at /playground/ with no console errors, and every asset resolves under the sub-path", async ({ page }) => {
  const problems = watchProblems(page);
  const requested: string[] = [];
  page.on("request", (request) => requested.push(new URL(request.url()).pathname));
  await page.goto("/playground/");
  await expect(page.getByText("Northbook").first()).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(requested).toContain("/playground/");
  expect(requested.some((path) => path.endsWith(".js"))).toBe(true);
  expect(requested.some((path) => path.endsWith(".css"))).toBe(true);
  for (const path of requested) expect(path.startsWith("/playground/"), `${path} escaped /playground/`).toBe(true);
  expect(problems).toEqual([]);
});

test("/playground without the trailing slash reaches Northbook too", async ({ page }) => {
  await page.goto("/playground");
  await expect(page).toHaveURL(/\/playground\/$/);
  await expect(page.getByText("Northbook").first()).toBeVisible();
});

test("the docs link to the playground and following the link opens it", async ({ page }) => {
  await page.goto("/");
  await page.locator(".landing-hero").getByRole("link", { name: "Playground" }).click();
  await expect(page).toHaveURL(/\/playground\/$/);
  await expect(page.getByText("Northbook").first()).toBeVisible();
});
