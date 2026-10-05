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

// Browsers fetch the tab icon on their own schedule (headless Chromium may not at all), so the links are resolved the
// way a browser resolves them, against the page URL, and each target is requested here.
test("the tab icons of Northbook resolve under /playground/ and answer 200", async ({ page }) => {
  await page.goto("/playground/");
  const icons = await page.locator('head link[rel~="icon"], head link[rel="apple-touch-icon"]').evaluateAll((links) =>
    links.map((link) => ({ rel: link.getAttribute("rel"), url: (link as HTMLLinkElement).href })),
  );
  expect(icons.map((icon) => new URL(icon.url).pathname).sort()).toEqual([
    "/playground/apple-touch-icon.png",
    "/playground/favicon.ico",
    "/playground/favicon.svg",
  ]);
  for (const icon of icons) {
    const response = await page.request.get(icon.url);
    expect(response.status(), icon.url).toBe(200);
    expect((await response.body()).byteLength, icon.url).toBeGreaterThan(0);
  }
  await expect(page.locator('head meta[name="theme-color"]')).toHaveAttribute("content", "#f1f2f4");
  await expect(page.locator('head meta[property="og:image"]')).toHaveAttribute("content", "https://damped.dagadev.net/og.png");
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
