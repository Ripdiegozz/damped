import { expect, type Locator, type Page } from "@playwright/test";

/** Everything a page reports that a visitor would call broken: errors and warnings, failed or 4xx/5xx requests. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`requestfailed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });
  return problems;
}

export type DemoName = "retarget-spring" | "spring-tuner" | "flip-reorder" | "morph-card" | "presence" | "compositor-vs-js" | "spring-instrument";

/**
 * The demo root, scrolled into view and hydrated. The islands hydrate when visible, and Astro removes `ssr` from the
 * island once it did, so waiting for that is what makes the first click land on a live component.
 */
export async function demo(page: Page, name: DemoName, which = 0): Promise<Locator> {
  const root = page.locator(`[data-demo="${name}"]`).nth(which);
  await root.scrollIntoViewIfNeeded();
  await expect(page.locator(`astro-island:not([ssr]):has([data-demo="${name}"])`).nth(which)).toBeAttached();
  return root;
}

export const runsOf = async (root: Locator): Promise<number> => Number(await root.getAttribute("data-runs"));

/**
 * Runs `act`, then checks the data-attribute contract: `data-runs` grew by at least `minimum`, and the demo ends up
 * `settled`. Returns how many runs it counted.
 */
export async function expectRunAndSettle(root: Locator, act: () => Promise<void>, minimum = 1): Promise<number> {
  const before = await runsOf(root);
  await act();
  await expect.poll(() => runsOf(root), { message: "data-runs should grow" }).toBeGreaterThanOrEqual(before + minimum);
  await expect(root).toHaveAttribute("data-state", "settled", { timeout: 10_000 });
  return (await runsOf(root)) - before;
}

/**
 * Records every value `data-phase` takes on `root` from now on, in order. Polling would miss a phase that lasts a few
 * frames (a reversal that starts near the card is over almost at once), an observer cannot.
 */
export async function recordPhases(root: Locator): Promise<() => Promise<string[]>> {
  await root.evaluate((element) => {
    const seen: string[] = [element.getAttribute("data-phase") ?? ""];
    new MutationObserver(() => {
      const phase = element.getAttribute("data-phase") ?? "";
      if (seen.at(-1) !== phase) seen.push(phase);
    }).observe(element, { attributes: true, attributeFilter: ["data-phase"] });
    (element as HTMLElement & { phases?: string[] }).phases = seen;
  });
  return () => root.evaluate((element) => (element as HTMLElement & { phases?: string[] }).phases ?? []);
}
