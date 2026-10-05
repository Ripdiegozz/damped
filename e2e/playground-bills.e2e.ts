import { expect, test, type Page } from "@playwright/test";
import { TOLERANCE_PX, navItem, openPlayground } from "./playground-helpers";

/** A frame count that is long enough to call a spring at rest. */
const STILL_FRAMES = 20;

async function openBills(page: Page, search = ""): Promise<string[]> {
  const problems = await openPlayground(page, search);
  await navItem(page, "Bills").click();
  await expect(page.locator("[data-bill-card]")).toHaveCount(7);
  return problems;
}

const card = (page: Page, id: string) => page.locator(`[data-bill-card="${id}"]`);
const dialog = (page: Page, id: string) => page.locator(`[data-bill-dialog="${id}"]`);

test("the bills grid shows seven varied cards", async ({ page }) => {
  const problems = await openBills(page);
  const harbor = card(page, "harbor-insurance");
  await expect(harbor).toContainText("Harbor Insurance");
  await expect(harbor).toContainText("$182.40");
  await expect(harbor).toContainText("Due in 3 days");
  await expect(harbor).toContainText("Autopay");
  await expect(card(page, "rent")).toContainText("Oak Street Apartments");
  await expect(page.locator("[data-bill-card]", { hasText: "Autopay" })).toHaveCount(3);

  const overdue = card(page, "fibernet").getByText("Overdue by 2 days");
  await expect(overdue).toBeVisible();
  expect(await overdue.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(196, 61, 61)");
  expect(problems).toEqual([]);
});

test("the dialog opens from the card's box and ends on its own box", async ({ page }) => {
  await openBills(page);
  const result = await page.evaluate(async () => {
    const box = (element: Element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return { x: left, y: top, width, height };
    };
    const source = document.querySelector<HTMLElement>('[data-bill-card="harbor-insurance"]')!;
    const target = document.querySelector<HTMLElement>('[data-bill-dialog="harbor-insurance"]')!;
    const backdrop = document.querySelector<HTMLElement>('[data-bill-backdrop="harbor-insurance"]')!;
    const cardBox = box(source);
    source.click();

    const samples: ReturnType<typeof box>[] = [];
    const opacities: number[] = [];
    await new Promise<void>((resolve) => {
      let still = 0;
      const tick = () => {
        const now = box(target);
        const last = samples.at(-1);
        samples.push(now);
        opacities.push(Number(getComputedStyle(backdrop).opacity));
        const moved = last !== undefined && (["x", "y", "width", "height"] as const).some((key) => Math.abs(now[key] - last[key]) > 0.01);
        still = moved || last === undefined ? 0 : still + 1;
        if (still >= 20) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return {
      cardBox,
      samples,
      opacities,
      final: box(target),
      viewport: { width: innerWidth, height: innerHeight },
      scale: new DOMMatrixReadOnly(getComputedStyle(target).transform).a,
      backdropTransition: getComputedStyle(backdrop).transitionDuration,
    };
  });

  const { cardBox, samples, final, viewport } = result;
  expect(samples.length).toBeGreaterThan(STILL_FRAMES);
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(Math.abs(samples[0]![key] - cardBox[key]), `first frame ${key}`).toBeLessThanOrEqual(TOLERANCE_PX);
  }
  // Its own box: centered in the viewport and at rest (no transform left over from the morph).
  expect(Math.abs(final.x + final.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(final.y + final.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(final.width).toBeGreaterThan(cardBox.width);
  expect(result.scale).toBeCloseTo(1, 3);

  // The backdrop fades in with the morph, driven by damped and not by a CSS transition.
  expect(result.backdropTransition).toBe("0s");
  expect(result.opacities[0]!).toBeLessThan(0.5);
  expect(result.opacities.at(-1)!).toBeGreaterThan(0.95);
  expect(result.opacities.some((opacity) => opacity > 0.05 && opacity < 0.95)).toBe(true);
});

test("the dialog shows the bill, the accounts and the actions", async ({ page }) => {
  await openBills(page);
  await card(page, "rent").click();
  const rent = dialog(page, "rent");
  await expect(rent).toBeVisible();
  await expect(rent).toHaveAttribute("aria-modal", "true");
  await expect(page.getByRole("dialog", { name: "Rent" })).toBeVisible();
  await expect(rent).toContainText("$1,850.00");
  await expect(rent).toContainText("From: Joint checking (John & Jane Doe) → To: Oak Street Apartments");
  await expect(rent.getByLabel("Amount")).toHaveValue("1850.00");
  await expect(rent.getByRole("button", { name: "Pay now" })).toBeVisible();
  await expect(rent.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("pressing Escape mid-open reverses with the same momentum and ends on the card with focus", async ({ page }) => {
  await openBills(page);
  const result = await page.evaluate(async () => {
    const width = (element: Element) => element.getBoundingClientRect().width;
    const source = document.querySelector<HTMLElement>('[data-bill-card="harbor-insurance"]')!;
    const target = document.querySelector<HTMLElement>('[data-bill-dialog="harbor-insurance"]')!;
    const cardWidth = width(source);
    source.focus();
    source.click();

    const REVERSE_AT = 6;
    const widths: number[] = [];
    await new Promise<void>((resolve) => {
      const tick = () => {
        const now = target.hidden ? 0 : width(target);
        widths.push(now);
        // Inside a frame, right after the sample: the same moment a real key press would land.
        if (widths.length === REVERSE_AT) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        // The dialog is re-hidden when the reverse morph settled, which is the end of this run.
        if (target.hidden && widths.length > REVERSE_AT) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return {
      cardWidth,
      widths,
      reverseAt: REVERSE_AT,
      hidden: target.hidden,
      focusOnCard: document.activeElement === source,
      cardOpacity: Number(getComputedStyle(source).opacity),
    };
  });

  const { widths, reverseAt, cardWidth } = result;
  const before = widths[reverseAt - 1]!;
  expect(before, "mid-open at the reversal").toBeGreaterThan(cardWidth + 5);
  // The first frame after the key press still grows: the velocity is kept, not reset.
  expect(widths[reverseAt]!).toBeGreaterThanOrEqual(before - 0.01);
  // It then turns around and shrinks onto the card.
  const peak = Math.max(...widths);
  const afterPeak = widths.slice(widths.indexOf(peak));
  expect(afterPeak.some((value) => value > 0 && value < peak - 20)).toBe(true);
  expect(Math.abs(afterPeak.filter((value) => value > 0).at(-1)! - cardWidth)).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(peak, "the full dialog width was never reached").toBeLessThan(440);
  expect(result.hidden).toBe(true);
  expect(result.focusOnCard).toBe(true);
  expect(result.cardOpacity).toBe(1);
});

test("keyboard: Enter opens, focus is trapped inside, Escape closes and focus returns", async ({ page }) => {
  await openBills(page);
  const harbor = card(page, "harbor-insurance");
  const modal = dialog(page, "harbor-insurance");
  await harbor.focus();
  await page.keyboard.press("Enter");

  await expect(modal).toBeVisible();
  await expect(modal.getByLabel("Amount")).toBeFocused();
  await expect(harbor).toHaveAttribute("aria-expanded", "true");

  const inside = () => modal.evaluate((element) => element.contains(document.activeElement));
  const names: string[] = [];
  for (let press = 0; press < 7; press++) {
    await page.keyboard.press("Tab");
    expect(await inside(), `Tab ${press + 1} stays inside`).toBe(true);
    names.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? ""));
  }
  // Three controls cycle: the amount, "Pay now" and "Cancel".
  expect(new Set(names).size).toBe(3);
  await page.keyboard.press("Shift+Tab");
  expect(await inside()).toBe(true);

  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(harbor).toBeFocused();
  await expect(harbor).toHaveAttribute("aria-expanded", "false");
});

test("Enter or Space while the dialog is closing opens it again", async ({ page }) => {
  await openBills(page);
  const harbor = card(page, "harbor-insurance");
  const modal = dialog(page, "harbor-insurance");
  for (const key of ["Enter", "Space"]) {
    await harbor.focus();
    await page.keyboard.press("Enter");
    await expect(modal.getByLabel("Amount")).toBeFocused();
    await page.keyboard.press("Escape");
    // Focus is on the card at once, and the dialog is inert while it travels back.
    await expect(harbor).toBeFocused();
    await expect(modal).toHaveJSProperty("inert", true);
    await page.keyboard.press(key);
    await expect(modal.getByLabel("Amount")).toBeFocused();
    await expect(modal).toHaveJSProperty("inert", false);
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
    await expect(harbor).toBeFocused();
  }
});

test("Cancel and the backdrop close the dialog", async ({ page }) => {
  await openBills(page);
  const modal = dialog(page, "blue-gym");

  await card(page, "blue-gym").click();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Cancel" }).click();
  await expect(modal).toBeHidden();
  await expect(card(page, "blue-gym")).toBeFocused();

  await card(page, "blue-gym").click();
  await expect(modal.getByLabel("Amount")).toBeFocused();
  await page.mouse.click(4, 4);
  await expect(modal).toBeHidden();
  await expect(card(page, "blue-gym")).toBeFocused();
});

test("arrow keys move across the grid by the live number of columns", async ({ page }) => {
  await openBills(page);
  const tops = await page.locator("[data-bill-card]").evaluateAll((cards) => cards.map((element) => (element as HTMLElement).offsetTop));
  const columns = tops.filter((top) => Math.abs(top - tops[0]!) <= 1).length;
  expect(columns).toBeGreaterThan(1);
  expect(columns).toBeLessThan(7);
  const ids = await page.locator("[data-bill-card]").evaluateAll((cards) => cards.map((element) => element.getAttribute("data-bill-card")!));

  await card(page, ids[0]!).focus();
  await page.keyboard.press("ArrowRight");
  await expect(card(page, ids[1]!)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(card(page, ids[1 + columns]!)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(card(page, ids[1]!)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(card(page, ids[0]!)).toBeFocused();
  await page.keyboard.press("End");
  await expect(card(page, ids[6]!)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(card(page, ids[0]!)).toBeFocused();

  // A narrower window has fewer columns, and the keys follow the layout.
  await page.setViewportSize({ width: 640, height: 800 });
  const narrowTops = await page.locator("[data-bill-card]").evaluateAll((cards) => cards.map((element) => (element as HTMLElement).offsetTop));
  const narrowColumns = narrowTops.filter((top) => Math.abs(top - narrowTops[0]!) <= 1).length;
  expect(narrowColumns).toBeLessThan(columns);
  await card(page, ids[0]!).focus();
  await page.keyboard.press("ArrowDown");
  await expect(card(page, ids[narrowColumns]!)).toBeFocused();
});

test("Pay now closes the dialog and marks the card paid with a badge that pops in", async ({ page }) => {
  await openBills(page);
  const modal = dialog(page, "city-power");
  await card(page, "city-power").click();
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Pay now" }).click();

  await expect(modal).toBeHidden();
  await expect(card(page, "city-power")).toHaveAttribute("data-paid", "true");
  await expect(card(page, "city-power")).toContainText("Paid");
  await expect(card(page, "city-power")).toBeFocused();
  const badge = card(page, "city-power").locator(".paid-badge");
  await expect
    .poll(() => badge.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a))
    .toBeCloseTo(1, 2);

  // A paid bill cannot be paid twice.
  await card(page, "city-power").click();
  await expect(modal.getByRole("button", { name: "Paid" })).toBeDisabled();
});

test("an amount that is not a positive sum keeps the dialog open", async ({ page }) => {
  await openBills(page);
  const modal = dialog(page, "blue-gym");
  await card(page, "blue-gym").click();
  const amount = modal.getByLabel("Amount");
  await amount.fill("abc");
  await modal.getByRole("button", { name: "Pay now" }).click();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(amount).toBeFocused();
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("alert")).toContainText("Enter an amount");
});

test("the morph does not re-render the grid or its cards", async ({ page }) => {
  await openBills(page, "?renders");
  const counts = () => page.evaluate(() => ({ ...(window as unknown as { __renders: Record<string, number> }).__renders }));
  const before = await counts();
  expect(before["bills-grid"]).toBeGreaterThan(0);

  const during = await page.evaluate(async () => {
    const renders = () => JSON.stringify((window as unknown as { __renders: Record<string, number> }).__renders);
    const source = document.querySelector<HTMLElement>('[data-bill-card="harbor-insurance"]')!;
    const target = document.querySelector<HTMLElement>('[data-bill-dialog="harbor-insurance"]')!;
    source.click();
    // React flushes the click's state change in a microtask. It re-renders the one card whose state changed
    // (isOpen); the frames after that must not render anything.
    await Promise.resolve();
    await Promise.resolve();
    const afterClick = renders();
    const seen = new Set<string>();
    let frames = 0;
    await new Promise<void>((resolve) => {
      let last = "";
      let still = 0;
      const tick = () => {
        frames++;
        seen.add(renders());
        const now = JSON.stringify(target.getBoundingClientRect());
        still = now === last ? still + 1 : 0;
        last = now;
        if (still >= 20) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { afterClick, seen: [...seen], frames };
  });

  expect(during.frames).toBeGreaterThan(20);
  expect(during.seen).toEqual([during.afterClick]);
  // The grid itself rendered nothing at all for the click.
  expect((await counts())["bills-grid"]).toBe(before["bills-grid"]);
});

test("the grid is a single tab stop that follows the arrow keys", async ({ page }) => {
  await openBills(page);
  const cards = page.locator("[data-bill-card]");
  const tabIndexes = () => cards.evaluateAll((elements) => elements.map((element) => (element as HTMLElement).tabIndex));
  const ids = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-bill-card")!));
  const inGrid = () => page.evaluate(() => document.activeElement?.closest("[data-bill-card]") !== null);

  // Initially the first card is the only stop.
  expect(await tabIndexes()).toEqual([0, -1, -1, -1, -1, -1, -1]);

  // Tab enters the grid once, on that card.
  await page.getByRole("button", { name: "+ New" }).focus();
  await page.keyboard.press("Tab");
  await expect(card(page, ids[0]!)).toBeFocused();

  // Arrows move focus and the tab stop with it.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(card(page, ids[2]!)).toBeFocused();
  expect(await tabIndexes()).toEqual([-1, -1, 0, -1, -1, -1, -1]);
  await page.keyboard.press("End");
  expect(await tabIndexes()).toEqual([-1, -1, -1, -1, -1, -1, 0]);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  // Shift+Tab leaves the grid backwards, and Tab comes back to the card that was focused last.
  await page.keyboard.press("Shift+Tab");
  expect(await inGrid()).toBe(false);
  await page.keyboard.press("Tab");
  await expect(card(page, ids[2]!)).toBeFocused();

  // The next Tab leaves the grid instead of visiting the other cards.
  await page.keyboard.press("Tab");
  expect(await inGrid()).toBe(false);
});

test("clicking a card makes it the tab stop, and closing its dialog keeps it there", async ({ page }) => {
  await openBills(page);
  const cards = page.locator("[data-bill-card]");
  const tabIndexes = () => cards.evaluateAll((elements) => elements.map((element) => (element as HTMLElement).tabIndex));

  await card(page, "blue-gym").click();
  await page.keyboard.press("Escape");
  await expect(dialog(page, "blue-gym")).toBeHidden();
  await expect(card(page, "blue-gym")).toBeFocused();
  expect(await tabIndexes()).toEqual([-1, -1, -1, 0, -1, -1, -1]);
});
