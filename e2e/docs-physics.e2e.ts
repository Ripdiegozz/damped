import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectRunAndSettle, runsOf, watchProblems } from "./docs-helpers";

const GUIDE = "/guides/springs-explained/";

type Figure = "physics-mass" | "physics-damping" | "physics-phase" | "physics-interruption";

async function open(page: Page): Promise<string[]> {
  const problems = watchProblems(page);
  await page.goto(GUIDE);
  return problems;
}

/** The figure root, scrolled into view and hydrated (the island loses `ssr` once its component is live). */
async function figure(page: Page, name: Figure): Promise<Locator> {
  const root = page.locator(`[data-demo="${name}"]`);
  await root.scrollIntoViewIfNeeded();
  await expect(page.locator(`astro-island:not([ssr]):has([data-demo="${name}"])`)).toBeAttached();
  return root;
}

const readout = (root: Locator, name: string): Locator => root.locator(`[data-readout="${name}"]`);
const number = (text: string | null): number => Number((text ?? "").replace("−", "-").replace(/[^\d.+-]/g, ""));

test("the guide renders the four figures idle, with no console problems", async ({ page }) => {
  const problems = await open(page);
  for (const name of ["physics-mass", "physics-damping", "physics-phase", "physics-interruption"] as const) {
    const root = await figure(page, name);
    await expect(root).toHaveAttribute("data-state", "idle");
    await expect(root).toHaveAttribute("data-runs", "0");
  }
  expect(problems).toEqual([]);
});

test("mass on a spring: the keyboard pulls and releases it, catching it mid-flight stops it, and it settles on rest", async ({ page }) => {
  const problems = await open(page);
  const root = await figure(page, "physics-mass");
  const mass = root.getByRole("slider", { name: /mass/i });
  await mass.focus();
  for (let press = 0; press < 6; press++) await page.keyboard.press("ArrowRight");
  await expect(readout(root, "position")).toHaveText("+72.0");
  await expect(mass).toHaveAttribute("aria-valuenow", "72");
  await expectRunAndSettle(
    root,
    async () => {
      await page.keyboard.press("Enter");
      await expect(root).toHaveAttribute("data-state", "animating");
      await expect(readout(root, "velocity")).not.toHaveText("0");
      // Catch it while it swings: it stops where it is.
      await page.keyboard.press("ArrowLeft");
      await expect(readout(root, "velocity")).toHaveText("0");
      const held = await readout(root, "position").textContent();
      await page.waitForTimeout(150);
      expect(await readout(root, "position").textContent()).toBe(held);
      await page.keyboard.press("Space");
    },
    2,
  );
  await expect(readout(root, "position")).toHaveText("0.0");
  await expect(mass).toHaveAttribute("aria-valuenow", "0");
  expect(problems).toEqual([]);
});

test("mass on a spring: a drag with the pointer releases with the velocity of the hand", async ({ page }) => {
  await open(page);
  const root = await figure(page, "physics-mass");
  const mass = root.getByRole("slider", { name: /mass/i });
  const box = (await mass.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(box.x + box.width / 2 + step * 14, y);
    await page.waitForTimeout(8);
  }
  await expect(readout(root, "position")).not.toHaveText("0.0");
  await expectRunAndSettle(root, () => page.mouse.up());
  await expect(readout(root, "position")).toHaveText("0.0");
});

test("damping ratio: the slider redraws the current curve, changes the behavior, and Replay settles", async ({ page }) => {
  const problems = await open(page);
  const root = await figure(page, "physics-damping");
  const range = root.locator('input[type="range"]');
  const curve = root.locator(".physics-current");
  const before = await curve.getAttribute("d");

  await range.fill("0.3");
  await expect.poll(() => curve.getAttribute("d")).not.toBe(before);
  await expect(readout(root, "kind")).toHaveText("underdamped");
  await expect(readout(root, "zeta")).toHaveText("0.30");
  await expect(readout(root, "bounce")).toHaveText("0.70");
  await range.fill("1");
  await expect(readout(root, "kind")).toHaveText("critically damped");
  await range.fill("1.5");
  await expect(readout(root, "kind")).toHaveText("overdamped");
  await expect(readout(root, "overshoot")).toHaveText("0.0 %");

  await expectRunAndSettle(root, () => root.getByRole("button", { name: "Replay" }).click());
  expect(problems).toEqual([]);
});

test("phase portrait: a release draws the path to the rest point, and a drag on the plane starts from that state", async ({ page }) => {
  const problems = await open(page);
  const root = await figure(page, "physics-phase");
  const trail = root.locator(".physics-trail");
  await expectRunAndSettle(root, () => root.getByRole("button", { name: "Pull and release" }).click());
  expect(((await trail.getAttribute("d")) ?? "").length).toBeGreaterThan(200);
  await expect(readout(root, "position")).toHaveText("0.00");
  await expect(readout(root, "velocity")).toHaveText("0.00");

  const plane = root.locator("svg.physics-plane");
  const box = (await plane.boundingBox())!;
  await expectRunAndSettle(root, async () => {
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3);
    await page.mouse.down();
    await expect(readout(root, "velocity")).not.toHaveText("0.00");
    await page.mouse.up();
  });
  await expect(readout(root, "position")).toHaveText("0.00");

  await root.getByRole("slider", { name: /position and velocity/i }).focus();
  await expectRunAndSettle(root, async () => {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
  });
  expect(problems).toEqual([]);
});

test("interruption: retargeting both lanes mid-flight keeps the damped velocity and drops the restart one", async ({ page }) => {
  const problems = await open(page);
  const root = await figure(page, "physics-interruption");
  const send = root.getByRole("button", { name: /^(Send|Retarget) both/ });
  await expectRunAndSettle(
    root,
    async () => {
      await send.click();
      await expect(root).toHaveAttribute("data-state", "animating");
      await expect.poll(async () => Math.abs(number(await readout(root, "damped-now").textContent()))).toBeGreaterThan(0.5);
      // The keyboard shortcut is the same button.
      await page.keyboard.press("r");
    },
    4,
  );
  const before = number(await readout(root, "damped-before").textContent());
  expect(before).toBeGreaterThan(0.3);
  await expect(readout(root, "restart-after")).toHaveText("0.00 /s");
  await expect(readout(root, "damped-after")).toHaveText(await readout(root, "damped-before").innerText());
  await expect(root.locator(".physics-plot:not(.physics-plot--speed) .physics-restart-line")).toHaveAttribute("d", /^M/);
  expect(await runsOf(root)).toBe(4);
  expect(problems).toEqual([]);
});

test("with reduced motion a release jumps, the figure is settled at once, and Play anyway restores the motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const root = await figure(page, "physics-mass");
  await expect(root.getByRole("note")).toContainText("Reduced motion is on");
  const mass = root.getByRole("slider", { name: /mass/i });
  await mass.focus();
  await page.keyboard.press("ArrowRight");
  await expectRunAndSettle(root, () => page.keyboard.press("Enter"));
  await expect(readout(root, "position")).toHaveText("0.0");

  await root.getByRole("button", { name: "Play anyway" }).click();
  await mass.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-state", "animating");
  await expect(root).toHaveAttribute("data-state", "settled", { timeout: 10_000 });
});
