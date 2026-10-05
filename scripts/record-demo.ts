import { chromium, type Browser, type Locator, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serveStatic } from "../e2e/static";
import { concatList, gifFilter, trimWindow } from "./gif-encode";
import { between, cursorPath, glideDuration, mulberry32 } from "./human-cursor";

// Dev tooling: records the Northbook playground headlessly in Chromium and converts the scripted scene into
// assets/northbook.gif with ffmpeg's two-pass palette method. The page is captured as lossless screencast frames with
// their timestamps (Playwright's video recorder is lossy, and its noise makes every frame of a GIF differ), which stay
// in the system temp directory. Needs ffmpeg on the PATH.
const root = resolve(import.meta.dir, "..");
const site = join(root, "apps/playground/dist");
const output = join(root, "assets/northbook.gif");

const VIEWPORT = { width: 1280, height: 800 };
const GIF_WIDTH = 720;
// The UI is flat colors, so a limited palette without dithering stays clean and keeps the file small.
const PALETTE_COLORS = 48;
const GIF_FPS = 24;
// Kept around the scene, so the GIF opens and ends on a still UI instead of on a click.
const LEAD_IN_S = 0.3;
const TAIL_S = 0.8;

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

// The scene is meant to read like a person using the app, not a script: the pointer follows curved, eased paths of
// varying length, rests on a target before the click, and the pauses between actions differ. Every "random" value comes
// from a seeded generator, so the recording is the same every time.
const random = mulberry32(2026);
const FRAME_MS = 16;
let cursor = { x: 380, y: 420 };

const pause = (page: Page, min: number, max: number): Promise<void> => page.waitForTimeout(between(random, min, max));

async function glide(page: Page, target: Locator): Promise<void> {
  const box = (await target.boundingBox())!;
  // Aim a little off the exact center, the way a hand does.
  const to = { x: box.x + box.width * between(random, 0.35, 0.65), y: box.y + box.height * between(random, 0.35, 0.65) };
  const duration = glideDuration(Math.hypot(to.x - cursor.x, to.y - cursor.y));
  const path = cursorPath(cursor, to, random, Math.round(duration / FRAME_MS));
  // Each point is due at a fixed time, so the glide lasts `duration` however long a mouse move takes to send.
  const began = Date.now();
  for (const [index, point] of path.entries()) {
    const wait = began + ((index + 1) * duration) / path.length - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await page.mouse.move(point.x, point.y);
  }
  cursor = to;
  await pause(page, 250, 380);
}

async function click(page: Page, target: Locator): Promise<void> {
  await glide(page, target);
  await page.mouse.down();
  await page.waitForTimeout(between(random, 60, 110));
  await page.mouse.up();
}

// The springs run at their real speed everywhere except one segment, which turns on the app's own "Slow motion (×4)"
// switch in the Spring lab so the reversal of a morph can be followed, and turns it off again afterwards.
async function scene(page: Page): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Primary" });
  const rent = page.locator('[data-bill-card="rent"]');
  const lab = page.getByRole("button", { name: "Spring lab" });
  const slowMotion = page.getByRole("switch", { name: /Slow motion/ });

  // Opens the Spring lab, flips the slow-motion switch and closes the lab again with Escape.
  const toggleSlowMotion = async (): Promise<void> => {
    await click(page, lab);
    await pause(page, 300, 450);
    await click(page, slowMotion);
    await pause(page, 500, 700);
    await page.keyboard.press("Escape");
    await pause(page, 400, 600);
  };

  // 1. Overview: the numbers count up, then hold.
  await pause(page, 1400, 1700);

  // 2. Bills: open a card at real speed, hold, close.
  await click(page, nav.getByRole("button", { name: "Bills" }));
  await pause(page, 700, 1000);
  await click(page, rent);
  await pause(page, 1100, 1400);
  // Closes while the pointer is already on its way to the Spring lab.
  await page.keyboard.press("Escape");

  // 3. The reversal in slow motion: open, let it travel about 40%, turn it around, and watch it keep moving first.
  await toggleSlowMotion();
  await click(page, rent);
  await page.waitForTimeout(REVERSAL_DELAY_MS);
  await page.keyboard.press("Escape");
  await pause(page, 2200, 2500);
  await toggleSlowMotion();

  // 4. Real speed again: open, pay, and read the toast.
  await click(page, rent);
  await pause(page, 700, 1000);
  await click(page, page.locator('[data-bill-dialog="rent"]').getByRole("button", { name: "Pay now" }));
  await pause(page, 1600, 1900);

  // 5. Activity: filter (the rows reorder with FLIP) and hold; delete one, then undo from its toast, and hold.
  await click(page, nav.getByRole("button", { name: "Activity" }));
  await pause(page, 700, 1000);
  await click(page, page.getByRole("group", { name: "Filter transactions" }).getByRole("button", { name: "Income", exact: true }));
  await pause(page, 1000, 1300);
  await click(page, page.getByRole("button", { name: "Delete Jane Doe, Oct 2" }));
  await pause(page, 700, 1000);
  await click(page, page.getByRole("button", { name: "Undo" }));
  await pause(page, 1300, 1600);
}

// With the default 0.5 s spring slowed ×4 by the Spring lab, this is about 40% of the way into the morph.
const REVERSAL_DELAY_MS = 520;

const work = mkdtempSync(join(tmpdir(), "northbook-record-"));
let browser: Browser | undefined;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/`);
  await page.locator("[data-stat='balance']").waitFor();

  // Every frame the browser composites, as a PNG with the time it was produced.
  const session = await context.newCDPSession(page);
  const frames: { file: string; time: number }[] = [];
  const writes: Promise<unknown>[] = [];
  session.on("Page.screencastFrame", (frame) => {
    const file = join(work, `frame-${String(frames.length).padStart(5, "0")}.png`);
    frames.push({ file, time: frame.metadata.timestamp! });
    writes.push(Bun.write(file, Buffer.from(frame.data, "base64")));
    void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  await page.waitForTimeout(300);

  const started = Date.now();
  await scene(page);
  const ended = Date.now();
  await page.waitForTimeout(TAIL_S * 1000);
  await session.send("Page.stopScreencast");
  const finish = Date.now() / 1000;
  await Promise.all(writes);
  await browser.close();

  const { start, length } = trimWindow({ created: frames[0]!.time * 1000, started, ended }, LEAD_IN_S, TAIL_S);
  const list = join(work, "frames.txt");
  writeFileSync(list, concatList(frames, finish));

  mkdirSync(resolve(output, ".."), { recursive: true });
  const filters = gifFilter(GIF_FPS, GIF_WIDTH);
  const palette = join(work, "palette.png");
  const trim = ["-f", "concat", "-safe", "0", "-i", list];
  const window = ["-ss", start.toFixed(3), "-t", length.toFixed(3)];
  await run(["ffmpeg", "-y", "-v", "error", ...trim, ...window, "-vf", `${filters},palettegen=max_colors=${PALETTE_COLORS}:stats_mode=diff`, palette]);
  await run([
    "ffmpeg", "-y", "-v", "error", ...trim, "-i", palette, ...window,
    "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    "-loop", "0", output,
  ]);
  const bytes = Bun.file(output).size;
  console.log(`${output}: ${(bytes / 1024 / 1024).toFixed(2)} MB, ${GIF_FPS} fps, ${length.toFixed(1)} s, ${frames.length} captured frames`);
} finally {
  // Also closes the browser when the recording or ffmpeg fails partway; closing twice is harmless.
  await browser?.close();
  await server.stop(true);
  rmSync(work, { recursive: true, force: true });
}
