import { chromium, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serveStatic } from "../e2e/static";
import { chooseFps, gifFilter, parseFrameRate, trimWindow } from "./gif-encode";

// Dev tooling: records the Northbook playground headlessly (Playwright video, Chromium) and converts the scripted scene
// into assets/northbook.gif with ffmpeg's two-pass palette method. The intermediate video stays in the system temp
// directory. Needs ffmpeg and ffprobe on the PATH.
const root = resolve(import.meta.dir, "..");
const site = join(root, "apps/playground/dist");
const output = join(root, "assets/northbook.gif");

const VIEWPORT = { width: 1280, height: 800 };
const GIF_WIDTH = 800;
// The UI is flat colors, so a limited palette without dithering stays clean and keeps the file small.
const PALETTE_COLORS = 40;
// Playwright records at 25 fps, so a higher rate would only repeat frames; 20 keeps the file under 4 MB at this size.
const MAX_FPS = 20;
// Kept around the scene, so the GIF opens and ends on a still UI instead of on a click.
const LEAD_IN_S = 0.3;
const TAIL_S = 0.6;

async function run(command: string[]): Promise<string> {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${command.join(" ")} exited with ${code}\n${stderr}`);
  return stdout;
}

if (!existsSync(join(site, "index.html"))) {
  console.log("apps/playground/dist is missing: building the playground first.");
  await run(["bun", "run", "playground:build"]);
}

// Serves the built playground at / on a free port, only for the duration of the recording.
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) => serveStatic([{ prefix: "/", dir: site }], new URL(request.url).pathname),
});

// The recorder does not capture the pointer, so a dot follows it; it exists only in the recorded page.
const CURSOR = `
  addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:99999;left:-30px;top:-30px;width:18px;height:18px;margin:-9px 0 0 -9px;"
      + "border-radius:50%;background:rgba(22,24,29,.85);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"
      + "pointer-events:none";
    document.body.append(dot);
    addEventListener("mousemove", (event) => { dot.style.left = event.clientX + "px"; dot.style.top = event.clientY + "px"; }, true);
  });
`;

async function click(page: Page, target: Locator): Promise<void> {
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.mouse.up();
}

// The scene, about nine seconds: the numbers count up, then Bills (open a card, reverse it mid-flight, open it again and
// pay, which raises a toast), then Activity (filter the rows, delete one, undo).
async function scene(page: Page): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Primary" });

  // 1. Overview: the numbers count; shuffling retargets them while they move.
  await page.waitForTimeout(700);
  await click(page, page.getByRole("button", { name: "Shuffle data" }));
  await page.waitForTimeout(900);

  // 2. Bills: open the Rent card.
  await click(page, nav.getByRole("button", { name: "Bills" }));
  await page.waitForTimeout(500);
  const rent = page.locator('[data-bill-card="rent"]');
  await click(page, rent);
  await page.waitForTimeout(160);
  // 3. Close it mid-flight: the morph reverses with the velocity it has.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);

  // 4. Open it again and pay: the dialog closes and a toast appears.
  await click(page, rent);
  await page.waitForTimeout(750);
  await click(page, page.locator('[data-bill-dialog="rent"]').getByRole("button", { name: "Pay now" }));
  await page.waitForTimeout(1100);

  // 5. Activity: filter (the rows reorder with FLIP), delete one, undo.
  await click(page, nav.getByRole("button", { name: "Activity" }));
  await page.waitForTimeout(550);
  await click(page, page.getByRole("group", { name: "Filter transactions" }).getByRole("button", { name: "Income", exact: true }));
  await page.waitForTimeout(850);
  await click(page, page.getByRole("button", { name: "Delete Jane Doe, Oct 2" }));
  await page.waitForTimeout(650);
  await click(page, page.getByRole("button", { name: "Undo" }));
  await page.waitForTimeout(800);
}

const work = mkdtempSync(join(tmpdir(), "northbook-record-"));
try {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: work, size: VIEWPORT },
  });
  await context.addInitScript(CURSOR);
  const created = Date.now();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/`);
  await page.locator("[data-stat='balance']").waitFor();
  const started = Date.now();
  await scene(page);
  const ended = Date.now();
  await page.waitForTimeout(TAIL_S * 1000);
  const video = page.video()!;
  await context.close();
  await browser.close();
  const source = await video.path();

  const { start, length } = trimWindow({ created, started, ended }, LEAD_IN_S, TAIL_S);
  const rate = await run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", source]);
  const fps = chooseFps(parseFrameRate(rate), MAX_FPS);

  mkdirSync(resolve(output, ".."), { recursive: true });
  const filters = gifFilter(fps, GIF_WIDTH);
  const palette = join(work, "palette.png");
  const trim = ["-ss", start.toFixed(3), "-t", length.toFixed(3), "-i", source];
  await run(["ffmpeg", "-y", "-v", "error", ...trim, "-vf", `${filters},palettegen=max_colors=${PALETTE_COLORS}:stats_mode=diff`, palette]);
  await run([
    "ffmpeg", "-y", "-v", "error", ...trim, "-i", palette,
    "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    "-loop", "0", output,
  ]);
  const bytes = Bun.file(output).size;
  console.log(`${output}: ${(bytes / 1024 / 1024).toFixed(2)} MB, ${fps} fps, ${length.toFixed(1)} s, trimmed ${start.toFixed(2)} s of lead-in`);
} finally {
  await server.stop(true);
  rmSync(work, { recursive: true, force: true });
}
