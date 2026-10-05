import type { Page } from "@playwright/test";

/** Opens e2e/fixtures/<fixture>.html and waits until the library module has loaded. */
export async function open(page: Page, fixture: "animate" | "layout" | "morph"): Promise<void> {
  await page.goto(`/${fixture}.html`);
  await page.waitForFunction(() => window.damped !== undefined);
}
