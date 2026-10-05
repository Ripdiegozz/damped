import { expect, test, type Locator, type Page } from "@playwright/test";
import { demo, expectRunAndSettle, runsOf, watchProblems } from "./docs-helpers";

const hero = (page: Page) => page.locator(".landing-hero");

/** Horizontal centre of an element in page pixels. */
const centreX = async (element: Locator): Promise<number> => {
  const box = await element.boundingBox();
  if (box === null) throw new Error("element has no box");
  return box.x + box.width / 2;
};

test("the landing page loads with no console errors or warnings and no failed request", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Springs that keep their momentum");
  // The package rows and the hero action links.
  await expect(page.locator(".package-row")).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/getting-started/");
  await expect(hero(page).getByRole("link", { name: "Playground" })).toHaveAttribute("href", "/playground/");
  await expect(hero(page).getByRole("link", { name: /GitHub/ })).toHaveAttribute("href", "https://github.com/Ripdiegozz/damped");
  await demo(page, "spring-instrument");
  await page.waitForLoadState("networkidle");
  expect(problems).toEqual([]);
});

test("pressing the track mid-flight retargets the mass, which comes to rest on the new rest dot", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/");
  const root = await demo(page, "spring-instrument");
  const track = root.getByRole("slider");
  const rail = root.locator(".instrument__rail");
  const box = (await rail.boundingBox())!;

  const runs = await expectRunAndSettle(root, async () => {
    await page.mouse.click(box.x + box.width * 0.9, box.y + 40);
    await expect(root).toHaveAttribute("data-state", "animating");
    // Mid-flight: send it back the other way.
    await page.mouse.click(box.x + box.width * 0.2, box.y + 40);
  }, 2);
  expect(runs).toBeGreaterThanOrEqual(2);
  await expect(track).toHaveAttribute("aria-valuenow", "20");
  await expect.poll(async () => Math.abs((await centreX(root.locator(".instrument__mass"))) - (await centreX(root.locator(".instrument__rest")))), { timeout: 5000 }).toBeLessThan(1);
  expect(Math.abs((await centreX(root.locator(".instrument__mass"))) - (box.x + box.width * 0.2))).toBeLessThan(1.5);
  expect(problems).toEqual([]);
});

test("dragging the mass and letting go springs it back to its rest point, drawing the phase portrait on the way", async ({ page }) => {
  await page.goto("/");
  const root = await demo(page, "spring-instrument");
  const mass = root.locator(".instrument__mass");
  const rest = await centreX(root.locator(".instrument__rest"));
  const from = (await mass.boundingBox())!;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };

  await expectRunAndSettle(root, async () => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect(root).toHaveAttribute("data-state", "animating");
    for (let step = 1; step <= 8; step++) await page.mouse.move(start.x + step * 30, start.y, { steps: 2 });
    expect(await centreX(mass)).toBeGreaterThan(rest + 150);
    await page.mouse.up();
    // The portrait fills in while the mass swings home.
    await expect.poll(() => root.locator(".instrument__phase-path").getAttribute("d"), { timeout: 3000 }).toMatch(/^M.* L/);
  });
  await expect.poll(async () => Math.abs((await centreX(mass)) - rest), { timeout: 5000 }).toBeLessThan(1);
  // At rest the portrait's head sits on its rest dot.
  const head = root.locator(".instrument__phase-head");
  await expect(head).toHaveAttribute("cx", "50");
  await expect(head).toHaveAttribute("cy", "50");
});

test("the keyboard moves the rest point: arrows, Home and End", async ({ page }) => {
  await page.goto("/");
  const root = await demo(page, "spring-instrument");
  const track = root.getByRole("slider");
  await track.focus();
  await expectRunAndSettle(root, async () => {
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
  }, 2);
  await expect(track).toHaveAttribute("aria-valuenow", "90");
  await expect(root.getByRole("status")).toContainText("90");
  await expectRunAndSettle(root, () => page.keyboard.press("Home"));
  await expect(track).toHaveAttribute("aria-valuenow", "0");
});

test("reduced motion: the mass jumps, Play anyway brings the spring back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const root = await demo(page, "spring-instrument");
  await expect(root.getByRole("note")).toContainText("Reduced motion is on");
  const box = (await root.locator(".instrument__rail").boundingBox())!;
  const before = await runsOf(root);
  await page.mouse.click(box.x + box.width * 0.8, box.y + 40);
  await expect(root).toHaveAttribute("data-state", "settled");
  expect(await runsOf(root)).toBe(before + 1);
  expect(Math.abs((await centreX(root.locator(".instrument__mass"))) - (box.x + box.width * 0.8))).toBeLessThan(1.5);

  await root.getByRole("button", { name: "Play anyway" }).click();
  await page.mouse.click(box.x + box.width * 0.2, box.y + 40);
  await expect(root).toHaveAttribute("data-state", "animating");
  await expect(root).toHaveAttribute("data-state", "settled", { timeout: 10_000 });
});

test("on a phone the page does not scroll sideways, and only the track gives up touch scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const root = await demo(page, "spring-instrument");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const touch = (selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).touchAction);
  expect(await root.getByRole("slider").evaluate((element) => getComputedStyle(element).touchAction)).toBe("none");
  expect(await touch("main")).not.toBe("none");
  expect(await touch(".landing-hero__tagline")).not.toBe("none");
});
