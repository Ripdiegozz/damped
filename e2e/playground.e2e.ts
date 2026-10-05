import { expect, test, type Page } from "@playwright/test";

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
