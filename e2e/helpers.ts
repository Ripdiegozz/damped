import { expect, type Page } from "@playwright/test";

/** Boxes are compared to sub-pixel layout noise: 1 px is below anything a user could see as a misplacement. */
export const TOLERANCE_PX = 1;
/** Fewer sampled frames than this means the recording missed the animation, so its assertions would prove nothing. */
export const MIN_FRAMES = 5;

export type Rect = ReturnType<Window["e2e"]["rect"]>;

/** Opens e2e/fixtures/<fixture>.html and waits until the library module has loaded. */
export async function open(page: Page, fixture: "animate" | "compositor" | "layout" | "morph"): Promise<void> {
  await page.goto(`/${fixture}.html`);
  await page.waitForFunction(() => window.damped !== undefined);
}

export function expectBox(actual: Rect, expected: Rect, label: string): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${label} ${key}: ${actual[key]} vs ${expected[key]}`).toBeLessThanOrEqual(
      TOLERANCE_PX,
    );
  }
}
