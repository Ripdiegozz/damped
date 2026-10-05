import { expect, test, type Page } from "@playwright/test";
import { TOLERANCE_PX, navItem, openPlayground, settledBox } from "./playground-helpers";

const rows = (page: Page) => page.locator("[data-activity-row]");
const chip = (page: Page, name: string) => page.getByRole("group", { name: "Filter transactions" }).getByRole("button", { name, exact: true });
const net = (page: Page) => page.locator("[data-net] .net-value");

async function openActivity(page: Page, search = "?toastMs=60000"): Promise<string[]> {
  const problems = await openPlayground(page, search);
  await navItem(page, "Activity").click();
  await expect(rows(page)).toHaveCount(27);
  // The view itself slides in; measure the rows only once it has stopped.
  await settledBox(page.locator('[data-view="activity"]'));
  return problems;
}

/** The viewport y of every row, by id, read in one go. */
const rowYs = (page: Page) =>
  rows(page).evaluateAll((elements) =>
    Object.fromEntries(elements.map((element) => [element.getAttribute("data-activity-row")!, element.getBoundingClientRect().y])),
  );

const rowIds = (page: Page) => rows(page).evaluateAll((elements) => elements.map((element) => element.getAttribute("data-activity-row")!));

/** Rows end one under the other with nothing left over from an animation. */
async function expectSettledStack(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      rows(page).evaluateAll((elements) => {
        const boxes = elements.map((element) => element.getBoundingClientRect());
        const gaps = boxes.slice(1).map((box, index) => box.y - boxes[index]!.y);
        const transforms = elements.map((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).isIdentity);
        const opacities = elements.map((element) => Number(getComputedStyle(element).opacity));
        return {
          uniform: gaps.every((gap) => Math.abs(gap - gaps[0]!) <= 1),
          identity: transforms.every(Boolean),
          opaque: opacities.every((opacity) => opacity === 1),
        };
      }),
    )
    .toEqual({ uniform: true, identity: true, opaque: true });
}

/**
 * Runs `act` (which must change the list in the page) and records every row's y for each frame until all of them have
 * been still for a while. Returns the y of each row before, on the first frame after, and at the end.
 */
async function recordRows(page: Page, act: string) {
  return page.evaluate(
    async ({ act: source }) => {
      const read = () =>
        Object.fromEntries(
          [...document.querySelectorAll("[data-activity-row]")].map((element) => [element.getAttribute("data-activity-row")!, element.getBoundingClientRect().y]),
        );
      const before = read();
      // The trigger is plain DOM code, so it runs in the same task as the recording below.
      new Function(source)();
      const frames: Record<string, number>[] = [];
      const startedAt = performance.now();
      await new Promise<void>((resolve) => {
        let still = 0;
        const tick = () => {
          const now = read();
          const last = frames.at(-1);
          frames.push(now);
          const same = last !== undefined && Object.keys(now).length === Object.keys(last).length && Object.keys(now).every((id) => Math.abs(now[id]! - last[id]!) < 0.01);
          still = same ? still + 1 : 0;
          // Rows that leave stay put while they fade, so stillness alone does not mean the reflow is over.
          if (still >= 25 && performance.now() - startedAt > 1500) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return { before, frames };
    },
    { act },
  );
}

test("the activity list is an accessible list with toggle chips, a sort and named delete buttons", async ({ page }) => {
  const problems = await openActivity(page);
  await expect(page.getByRole("list", { name: "Transactions" })).toBeVisible();
  for (const name of ["All", "Income", "Expenses", "Groceries", "Dining", "Utilities", "Transport"]) {
    await expect(chip(page, name)).toBeVisible();
  }
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "Income")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Sort by")).toHaveValue("newest");
  await expect(page.getByRole("button", { name: "Delete Corner Grocery, Oct 4" })).toBeVisible();
  await expect(rows(page).first()).toContainText("Corner Grocery");
  await expect(rows(page).first()).toContainText("-$62.14");
  expect(problems).toEqual([]);
});

test("the net total settles on the sum of what is shown", async ({ page }) => {
  await openActivity(page);
  await expect(page.locator("[data-net]")).toContainText("Net:");
  await expect(net(page)).toHaveText("+$3,496.25");
  await chip(page, "Income").click();
  await expect(net(page)).toHaveText("+$8,460.00");
  await chip(page, "Expenses").click();
  await expect(net(page)).toHaveText("-$4,963.75");
  await chip(page, "Groceries").click();
  await expect(net(page)).toHaveText("-$367.28");
});

test("filtering removes rows with an exit and the rest spring up, without a row jumping on the first frame", async ({ page }) => {
  await openActivity(page);
  const { before, frames } = await recordRows(page, `document.evaluate("//button[normalize-space()='Income']", document, null, 9, null).singleNodeValue.click()`);

  // First frame: every row is still where it was (rows that leave fade in place, the others have not moved yet).
  const first = frames[0]!;
  for (const [id, y] of Object.entries(first)) expect(Math.abs(y - before[id]!), `row ${id} on the first frame`).toBeLessThanOrEqual(TOLERANCE_PX);

  await expect(rows(page)).toHaveCount(4);
  await expect(chip(page, "Income")).toHaveAttribute("aria-pressed", "true");
  const amounts = await rows(page).locator(".amount").allTextContents();
  expect(amounts.every((text) => text.startsWith("+"))).toBe(true);
  await expectSettledStack(page);

  // The rows that stay travel through in-between positions to their new place.
  const last = frames.at(-1)!;
  const moved = Object.keys(last).filter((id) => Math.abs(last[id]! - before[id]!) > 20);
  expect(moved.length).toBeGreaterThan(0);
  for (const id of moved) {
    const between = frames.filter((frame) => id in frame && Math.min(before[id]!, last[id]!) + 2 < frame[id]! && frame[id]! < Math.max(before[id]!, last[id]!) - 2);
    expect(between.length, `row ${id} animates`).toBeGreaterThanOrEqual(3);
  }

  // Back to everything: the rows come back and the list is whole again.
  await chip(page, "Income").click();
  await expect(rows(page)).toHaveCount(27);
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expectSettledStack(page);
});

test("a category chip shows that category only", async ({ page }) => {
  await openActivity(page);
  await chip(page, "Dining").click();
  await expect(rows(page)).toHaveCount(4);
  expect(await rows(page).locator(".activity-category").allTextContents()).toEqual(["Dining", "Dining", "Dining", "Dining"]);
  await expectSettledStack(page);
});

test("sorting re-orders the rows with a FLIP: right order, right positions and no jump on the first frame", async ({ page }) => {
  await openActivity(page);
  const initial = await rowIds(page);

  const { before, frames } = await recordRows(page, `const select = document.querySelector('select'); select.value = 'oldest'; select.dispatchEvent(new Event('change', { bubbles: true }))`);
  for (const [id, y] of Object.entries(frames[0]!)) expect(Math.abs(y - before[id]!), `row ${id} on the first frame`).toBeLessThanOrEqual(TOLERANCE_PX);

  const oldest = await rowIds(page);
  expect(oldest).toEqual([...initial].reverse());
  const dates = await rows(page).locator("time").evaluateAll((elements) => elements.map((element) => element.getAttribute("datetime")!));
  expect([...dates].sort()).toEqual(dates);
  await expectSettledStack(page);
  // Rows that crossed the list took in-between positions.
  const middle = initial[3]!;
  const path = frames.map((frame) => frame[middle]!);
  expect(path.filter((y) => y > Math.min(path[0]!, path.at(-1)!) + 2 && y < Math.max(path[0]!, path.at(-1)!) - 2).length).toBeGreaterThanOrEqual(3);

  await page.getByLabel("Sort by").selectOption("amount");
  await expect.poll(() => rows(page).locator(".amount").allTextContents().then((texts) => texts.map((text) => Math.abs(Number(text.replace(/[^0-9.]/g, "")))))).toEqual(
    [3850, 3850, 1850, 1850, 640, 182.4, 120, 120, 103.77, 94.3, 91.08, 88.42, 76.2, 71.65, 64, 62.14, 59.99, 45, 41.3, 39, 28, 27.6, 18, 14.85, 14.2, 12.35, 9.5],
  );
  await expectSettledStack(page);
});

test("adding a transaction inserts a row at the top that enters while the rest move down", async ({ page }) => {
  await openActivity(page);
  const topBefore = (await rowIds(page))[0]!;
  const { before, frames } = await recordRows(page, `document.querySelector('[data-add-transaction]').click()`);

  await expect(rows(page)).toHaveCount(28);
  const ids = await rowIds(page);
  expect(ids[1]).toBe(topBefore);
  await expect(rows(page).first()).toContainText("Greenleaf Market");
  await expect(rows(page).first()).toContainText("Oct 5");
  // The previous top row starts where it was and is pushed down by springs.
  expect(Math.abs(frames[0]![topBefore]! - before[topBefore]!)).toBeLessThanOrEqual(TOLERANCE_PX);
  const path = frames.map((frame) => frame[topBefore]!);
  const rise = path.at(-1)! - before[topBefore]!;
  expect(rise).toBeGreaterThan(20);
  expect(path.filter((y) => y > before[topBefore]! + 2 && y < path.at(-1)! - 2).length).toBeGreaterThanOrEqual(3);
  await expectSettledStack(page);

  await expect(page.getByRole("status").filter({ hasText: "Added Greenleaf Market" })).toHaveCount(1);
  await expect(net(page)).toHaveText("+$3,459.45");

  // The top bar's "+ New" does the same while this view is open.
  await page.getByRole("button", { name: "+ New" }).click();
  await expect(rows(page)).toHaveCount(29);
});

test("adding while a filter would hide the new row clears the filter", async ({ page }) => {
  await openActivity(page);
  await chip(page, "Utilities").click();
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(chip(page, "All")).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(28);
});

test("deleting a row shows an undo toast, and undo brings the row back where it was", async ({ page }) => {
  await openActivity(page);
  const idsBefore = await rowIds(page);
  const target = idsBefore[3]!;

  await page.getByRole("button", { name: "Delete Brightline Studio, Oct 1" }).click();
  await expect(rows(page)).toHaveCount(26);
  await expect(page.locator(`[data-activity-row="${target}"]`)).toHaveCount(0);
  const toast = page.getByRole("status").filter({ hasText: "Deleted Brightline Studio" });
  await expect(toast).toHaveCount(1);
  await expect(net(page)).toHaveText("-$353.75");
  await expectSettledStack(page);

  // Focus is not lost with the row that had it.
  await expect(page.locator("[data-activity-row] button:focus")).toHaveCount(1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(27);
  expect(await rowIds(page)).toEqual(idsBefore);
  await expect(net(page)).toHaveText("+$3,496.25");
  await expectSettledStack(page);
  await expect(toast).toHaveCount(0);
});

test("the restored row enters with a fade", async ({ page }) => {
  await openActivity(page);
  await page.getByRole("button", { name: "Delete Corner Grocery, Oct 4" }).click();
  await expect(rows(page)).toHaveCount(26);
  const opacities = await page.evaluate(async () => {
    const undo = [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Undo")!;
    undo.click();
    await Promise.resolve();
    await Promise.resolve();
    const samples: number[] = [];
    await new Promise<void>((resolve) => {
      let frames = 0;
      const tick = () => {
        const element = document.querySelector('[data-activity-row="a-027"]');
        if (element !== null) samples.push(Number(getComputedStyle(element).opacity));
        if (++frames > 30) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return samples;
  });
  expect(opacities[0]!).toBeLessThan(0.6);
  expect(opacities.at(-1)!).toBeGreaterThan(0.95);
});
