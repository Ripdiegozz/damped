import { expect, type Locator, type Page } from "@playwright/test";

const PLAYGROUND = "/playground/";

/** Opens the built playground and records everything the page reports as an error. */
export async function openPlayground(page: Page, search = ""): Promise<string[]> {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`requestfailed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });
  await page.goto(PLAYGROUND + search);
  return problems;
}

/** Rects are compared to sub-pixel layout noise: 1 px is below anything a user could see as a misplacement. */
export const TOLERANCE_PX = 1;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Resolves with the element's final box once it has not moved for a few frames, i.e. its animation settled. */
export async function settledBox(locator: Locator): Promise<Box> {
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

export function expectBox(actual: Box, expected: Box, label: string): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${label} ${key}: ${actual[key]} vs ${expected[key]}`).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
  }
}

export const navItem = (page: Page, name: string) => page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name });

