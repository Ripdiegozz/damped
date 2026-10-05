import { expect, test } from "@playwright/test";
import { watchProblems } from "./docs-helpers";

// The docs theme in a real browser: the self-hosted fonts load, the chrome is neutral, and the accent is a thin
// indicator rather than a filled block.

test("Geist and Geist Mono load from the site itself and set the page, the headings and the shortcut", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/getting-started/");
  await page.waitForLoadState("networkidle");
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const family = (selector: string) => getComputedStyle(document.querySelector(selector)!).fontFamily;
    return {
      body: family("body"),
      title: family("h1#_top"),
      mono: family("button[data-open-modal] kbd"),
      loadedSans: document.fonts.check('600 16px "Geist Variable"'),
      loadedMono: document.fonts.check('400 16px "Geist Mono Variable"'),
      titleWeight: getComputedStyle(document.querySelector("h1#_top")!).fontWeight,
    };
  });
  expect(fonts.body).toContain("Geist Variable");
  expect(fonts.title).toContain("Geist Variable");
  expect(fonts.title).not.toMatch(/Fraunces|Georgia|(?<!sans-)serif/);
  expect(fonts.mono).toContain("Geist Mono Variable");
  expect(fonts.loadedSans && fonts.loadedMono).toBe(true);
  expect(fonts.titleWeight).toBe("600");
  expect(problems).toEqual([]);
});

test("the current sidebar item is ink with a thin accent bar, not a filled pill", async ({ page }) => {
  await page.goto("/getting-started/");
  const current = page.locator('.sidebar-content a[aria-current="page"]');
  await expect(current).toBeVisible();
  const style = await current.evaluate((link) => {
    const bar = getComputedStyle(link, "::before");
    return { background: getComputedStyle(link).backgroundColor, barWidth: bar.width, barBackground: bar.backgroundColor };
  });
  expect(style.background).toBe("rgba(0, 0, 0, 0)");
  expect(style.barWidth).toBe("2px");
  expect(style.barBackground).not.toBe("rgba(0, 0, 0, 0)");
});

test("the header holds the lockup and no visible site title", async ({ page }) => {
  await page.goto("/getting-started/");
  const logo = page.locator("header .site-title img:visible");
  await expect(logo).toHaveCount(1);
  await expect(logo).toHaveAttribute("alt", "damped");
  const title = page.locator("header .site-title span");
  const box = await title.boundingBox();
  expect(box === null || (box.width <= 1 && box.height <= 1)).toBe(true);
});

for (const path of ["/", "/getting-started/", "/guides/testing/", "/reference/react/", "/guides/demos/"]) {
  test(`${path} does not scroll sideways on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: window.innerWidth }));
    expect(widths.page).toBeLessThanOrEqual(widths.window);
  });
}

test("a pointer click on the retarget track leaves no focus ring, a Tab onto it draws a thin one", async ({ page }) => {
  await page.goto("/guides/demos/");
  const track = page.locator(".retarget-track");
  await track.scrollIntoViewIfNeeded();
  await expect(page.locator('astro-island:not([ssr]):has([data-demo="retarget-spring"])')).toBeAttached();
  await track.click();
  await expect(track).toBeFocused();
  expect(await track.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("none");

  await page.reload();
  await expect(page.locator('astro-island:not([ssr]):has([data-demo="retarget-spring"])')).toBeAttached();
  await track.evaluate((element) => {
    const focusables = [...document.querySelectorAll<HTMLElement>("a[href], button, [tabindex='0']")];
    focusables[focusables.indexOf(element as HTMLElement) - 1]!.focus();
  });
  await page.keyboard.press("Tab");
  await expect(track).toBeFocused();
  const outline = await track.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), offset: style.outlineOffset };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBeLessThanOrEqual(2);
  expect(outline.offset).toBe("2px");
});
