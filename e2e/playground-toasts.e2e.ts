import { expect, test, type Page } from "@playwright/test";
import { TOLERANCE_PX, navItem, openPlayground, settledBox } from "./playground-helpers";

const REGION_MARGIN_PX = 16;
const NEW_TOAST = "New transaction draft created";

const toasts = (page: Page) => page.getByRole("status");
const raise = (page: Page) => page.getByRole("button", { name: "+ New" }).click();

async function payBill(page: Page, id: string, amount?: string): Promise<void> {
  await navItem(page, "Bills").click();
  await page.locator(`[data-bill-card="${id}"]`).click();
  const modal = page.locator(`[data-bill-dialog="${id}"]`);
  if (amount !== undefined) await modal.getByLabel("Amount").fill(amount);
  await modal.getByRole("button", { name: "Pay now" }).click();
  await expect(modal).toBeHidden();
}

test("+ New raises a polite status toast in the body, bottom right", async ({ page }) => {
  const problems = await openPlayground(page);
  await raise(page);
  const toast = toasts(page).filter({ hasText: NEW_TOAST });
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveAttribute("aria-live", "polite");
  expect(await toast.evaluate((element) => element.closest("body > .toast-region") !== null)).toBe(true);

  const box = await settledBox(toast);
  const viewport = page.viewportSize()!;
  expect(Math.abs(box.x + box.width - (viewport.width - REGION_MARGIN_PX))).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(box.y + box.height - (viewport.height - REGION_MARGIN_PX))).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(problems).toEqual([]);
});

test("on a narrow screen the stack is centered at the bottom", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await openPlayground(page);
  await raise(page);
  const box = await settledBox(toasts(page).first());
  expect(Math.abs(box.x + box.width / 2 - 420 / 2)).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(box.y + box.height - (800 - REGION_MARGIN_PX))).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(box.width).toBeLessThanOrEqual(420 - 2 * REGION_MARGIN_PX + TOLERANCE_PX);
});

test("a toast enters from below, small and transparent, and leaves to the right", async ({ page }) => {
  await openPlayground(page, "?toastMs=60000");
  const entering = await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>("button.button.primary")!.click();
    const samples: { opacity: number; scale: number; y: number }[] = [];
    await new Promise<void>((resolve) => {
      let still = 0;
      let last = -1;
      const tick = () => {
        const element = document.querySelector<HTMLElement>(".toast");
        if (element !== null) {
          const opacity = Number(getComputedStyle(element).opacity);
          const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
          samples.push({ opacity, scale: matrix.a, y: matrix.f });
          still = opacity === last ? still + 1 : 0;
          last = opacity;
        }
        if (still >= 20) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return samples;
  });
  expect(entering[0]!.opacity).toBeLessThan(0.5);
  expect(entering[0]!.scale).toBeLessThan(0.99);
  expect(entering[0]!.y).toBeGreaterThan(5);
  expect(entering.at(-1)!.opacity).toBe(1);
  expect(entering.at(-1)!.scale).toBeCloseTo(1, 3);

  const leaving = await page.evaluate(async () => {
    const element = document.querySelector<HTMLElement>(".toast")!;
    const start = element.getBoundingClientRect().x;
    element.querySelector<HTMLButtonElement>("button")!.click();
    let farthest = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (!element.isConnected) return resolve();
        farthest = Math.max(farthest, element.getBoundingClientRect().x - start);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return farthest;
  });
  expect(leaving).toBeGreaterThan(8);
  await expect(toasts(page)).toHaveCount(0);
});

test("Pay now raises a toast with the paid amount and it dismisses itself", async ({ page }) => {
  await openPlayground(page, "?toastMs=2500");
  await payBill(page, "harbor-insurance");
  await expect(toasts(page).filter({ hasText: "Paid $182.40 to Harbor Insurance" })).toHaveCount(1);
  await expect(page.locator('[data-bill-card="harbor-insurance"]')).toHaveAttribute("data-paid", "true");
  await expect(toasts(page)).toHaveCount(0);
});

test("the toast shows the amount that was typed", async ({ page }) => {
  await openPlayground(page, "?toastMs=60000");
  await payBill(page, "rent", "1,200.5");
  await expect(toasts(page)).toHaveText(/Paid \$1,200\.50 to Oak Street Apartments/);
});

test("at most four toasts stay; the oldest one leaves", async ({ page }) => {
  await openPlayground(page, "?toastMs=60000");
  for (let press = 0; press < 5; press++) await raise(page);
  await expect(toasts(page)).toHaveCount(4);
  const ids = await toasts(page).evaluateAll((elements) => elements.map((element) => Number(element.getAttribute("data-toast-id"))));
  // Ids count up from 1 in a fresh page: the first toast, id 1, is the one that left.
  expect(ids).toEqual([2, 3, 4, 5]);
});

test("hovering a toast pauses its dismissal", async ({ page }) => {
  await openPlayground(page, "?toastMs=1500");
  await raise(page);
  const toast = toasts(page).first();
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.waitForTimeout(2500);
  await expect(toast).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(toasts(page)).toHaveCount(0);
});

test("focusing inside a toast pauses its dismissal", async ({ page }) => {
  await openPlayground(page, "?toastMs=1500");
  await raise(page);
  const close = toasts(page).first().getByRole("button", { name: "Dismiss notification" });
  await close.focus();
  await page.waitForTimeout(2500);
  await expect(toasts(page)).toHaveCount(1);
  await close.blur();
  await expect(toasts(page)).toHaveCount(0);
});

test("the close button dismisses a toast", async ({ page }) => {
  await openPlayground(page, "?toastMs=60000");
  await raise(page);
  await toasts(page).first().getByRole("button", { name: "Dismiss notification" }).click();
  await expect(toasts(page)).toHaveCount(0);
});

test("when a toast leaves, the ones above it spring down into its place", async ({ page }) => {
  await openPlayground(page, "?toastMs=60000");
  for (let press = 0; press < 3; press++) await raise(page);
  await expect(toasts(page)).toHaveCount(3);
  // By id, because "the third toast" stops existing when the second one leaves.
  const first = page.locator('[data-toast-id="1"]');
  const middle = page.locator('[data-toast-id="2"]');
  const last = page.locator('[data-toast-id="3"]');
  await settledBox(first);
  const lastBefore = await settledBox(last);
  const firstBefore = await settledBox(first);
  const middleBox = await settledBox(middle);
  const shift = middleBox.height + (middleBox.y - (firstBefore.y + firstBefore.height));

  const samples = await first.evaluate(async (element) => {
    const middleToast = element.nextElementSibling as HTMLElement;
    const ys: number[] = [];
    middleToast.querySelector<HTMLButtonElement>("button")!.click();
    await new Promise<void>((resolve) => {
      let gone = false;
      let still = 0;
      const tick = () => {
        if (!middleToast.isConnected) gone = true;
        const y = element.getBoundingClientRect().y;
        still = gone && ys.length > 0 && Math.abs(y - ys.at(-1)!) < 0.01 ? still + 1 : 0;
        ys.push(y);
        if (still >= 20) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return ys;
  });

  const start = firstBefore.y;
  const end = samples.at(-1)!;
  expect(Math.abs(end - (start + shift))).toBeLessThanOrEqual(TOLERANCE_PX);
  // It travels there through intermediate positions instead of jumping.
  const between = samples.filter((y) => y > start + 2 && y < start + shift - 2);
  expect(between.length).toBeGreaterThanOrEqual(3);
  // The toast below the removed one stays where it is.
  expect(Math.abs((await settledBox(last)).y - lastBefore.y)).toBeLessThanOrEqual(TOLERANCE_PX);
  await expect(toasts(page)).toHaveCount(2);
});

test("a new toast pushes the existing ones up with a spring", async ({ page }) => {
  await openPlayground(page, "?toastMs=60000");
  await raise(page);
  const first = toasts(page).first();
  const before = await settledBox(first);
  const ys = await first.evaluate(async (element) => {
    const samples: number[] = [];
    document.querySelector<HTMLButtonElement>("button.button.primary")!.click();
    await new Promise<void>((resolve) => {
      let still = 0;
      const tick = () => {
        const y = element.getBoundingClientRect().y;
        still = samples.length > 0 && Math.abs(y - samples.at(-1)!) < 0.01 ? still + 1 : 0;
        samples.push(y);
        if (still >= 20) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return samples;
  });
  expect(ys.at(-1)!).toBeLessThan(before.y - 20);
  expect(ys.filter((y) => y < before.y - 2 && y > ys.at(-1)! + 2).length).toBeGreaterThanOrEqual(3);
  await expect(toasts(page)).toHaveCount(2);
});
