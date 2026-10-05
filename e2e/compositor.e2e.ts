import { expect, test } from "@playwright/test";
import { MIN_FRAMES, open } from "./helpers";

// The compositor driver samples the spring into linear keyframes at 120 Hz, so between samples the browser draws a chord
// through the curve instead of the curve itself. The bound below is the measured worst case plus a small margin.
const SAMPLING_TOLERANCE_PX = 0.5;
// How long the main thread is blocked, and how long into the animation that starts.
const BLOCK_MS = 250;
const LEAD_IN_MS = 50;
// Timeline clocks are floating point and read at slightly different instants: sub-millisecond slack, no more.
const CLOCK_SLACK_MS = 1;
// Frames this close to either end of the block may predate it or be delivered after it, so they are not counted.
const EDGE_MS = 30;
// At 60 Hz a 250 ms block spans about 15 frames; far fewer would mean the screencast, not the animation, was the problem.
const MIN_BLOCKED_FRAMES = 5;
// The reversal is triggered once this many frames are recorded: about 100 ms in, in the fast phase.
const REVERSAL_FRAME = 7;
const BASELINE_FRAMES = 3;
const JUMP_FACTOR = 3;
const MIN_FRAMES_AFTER_REVERSAL = 5;
const MIN_BASELINE_PX = 1;

test("a compositor animation ends exactly on its target with inline styles committed and nothing left running", async ({
  page,
}) => {
  await open(page, "compositor");

  const result = await page.evaluate(async () => {
    const box = document.getElementById("compositor")!;
    const controls = window.damped.animate(box, { x: 300 }, { driver: window.damped.compositor });
    const running = box.getAnimations().length;
    await controls.finished;
    return {
      running,
      remaining: box.getAnimations().length,
      // Parsed, because the browser normalizes the serialization (`0` becomes `0px`).
      inline: box.style.transform === "" ? undefined : { x: new DOMMatrix(box.style.transform).m41, y: new DOMMatrix(box.style.transform).m42 },
      computed: new DOMMatrix(getComputedStyle(box).transform).m41,
      frames: window.e2e.frames(),
    };
  });

  expect(result.running).toBe(1);
  expect(result.remaining).toBe(0);
  expect(result.inline).toEqual({ x: 300, y: 0 });
  expect(result.computed).toBe(300);
  // The compositor driver never asks for an animation frame.
  expect(result.frames).toBe(0);
});

test("a compositor animation keeps drawing while the main thread is blocked, a JS animation freezes", async ({
  page,
}, testInfo) => {
  await open(page, "compositor");
  // The compositor's own output is the only place the block cannot hide the animation: the screencast delivers the
  // frames the browser process composites, which carry on while the page's main thread is stuck in a loop.
  const session = await page.context().newCDPSession(page);
  const frames: { at: number; data: string }[] = [];
  session.on("Page.screencastFrame", (frame) => {
    frames.push({ at: performance.now(), data: frame.data });
    void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  await session.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });

  const started = await page.evaluate(async (leadIn) => {
    const spring = { duration: 1, bounce: 0.15 };
    const compositor = document.getElementById("compositor")!;
    const fast = window.damped.animate(compositor, { x: 300 }, { ...spring, driver: window.damped.compositor });
    const slow = window.damped.animate(document.getElementById("js")!, { x: 300 }, spring);
    Object.assign(window, { settled: Promise.all([fast.finished, slow.finished]) });
    const animation = compositor.getAnimations()[0]!;
    await animation.ready;
    await window.e2e.sleep(leadIn);
    return animation.currentTime as number;
  }, LEAD_IN_MS);

  const blockStart = performance.now();
  const blocked = await page.evaluate((blockMs) => {
    const begin = performance.now();
    while (performance.now() - begin < blockMs) {
      // Busy loop: no frame, timer or promise callback can run.
    }
    return performance.now() - begin;
  }, BLOCK_MS);
  const blockEnd = performance.now();

  // The first frame after the block: the timeline time only moves with frames, so this is where it can be read.
  const after = await page.evaluate(async () => {
    await window.e2e.nextFrame();
    const compositor = document.getElementById("compositor")!;
    const animation = compositor.getAnimations()[0]!;
    return {
      playback: animation.currentTime as number,
      playState: animation.playState,
      x: new DOMMatrix(getComputedStyle(compositor).transform).m41,
    };
  });
  await session.send("Page.stopScreencast");
  const final = await page.evaluate(async () => {
    await (window as unknown as { settled: Promise<unknown> }).settled;
    const read = (id: string) => new DOMMatrix(getComputedStyle(document.getElementById(id)!).transform).m41;
    return { compositor: read("compositor"), js: read("js") };
  });

  // Left edge of each box in every frame that was composited while the page was blocked.
  const during = frames.filter((frame) => frame.at > blockStart + EDGE_MS && frame.at < blockEnd - EDGE_MS);
  const edges = await page.evaluate(async (images) => {
    const edge = (data: Uint8ClampedArray, width: number, y: number): number => {
      for (let x = 0; x < width; x++) if (data[(y * width + x) * 4] !== 255 || data[(y * width + x) * 4 + 2] !== 255) return x;
      return -1;
    };
    const result: { compositor: number; js: number }[] = [];
    for (const image of images) {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${image}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const { data, width } = context.getImageData(0, 0, bitmap.width, bitmap.height);
      // Rows through the middle of each box; the boxes are 20 px from the left edge before they move.
      result.push({ compositor: edge(data, width, 70) - 20, js: edge(data, width, 210) - 20 });
    }
    return result;
  }, during.map((frame) => frame.data));

  const compositorEdges = edges.map((entry) => entry.compositor);
  const distinct = new Set(compositorEdges).size;
  const analytic = await page.evaluate(
    (playback) =>
      window.damped.createSpring(0, 300, 0, { duration: 1, bounce: 0.15, restDelta: 0.01, restSpeed: 0.1 }).at(playback / 1000).position,
    after.playback,
  );

  testInfo.annotations.push(
    { type: "blocked", description: `${blocked.toFixed(1)} ms` },
    { type: "frames composited during the block", description: String(during.length) },
    { type: "compositor box x in those frames", description: `${compositorEdges[0]} -> ${compositorEdges.at(-1)} (${distinct} distinct)` },
    { type: "js box x in those frames", description: [...new Set(edges.map((entry) => entry.js))].join(", ") },
    { type: "playback advance", description: `${(after.playback - started).toFixed(1)} ms` },
    { type: "x after the block / analytic", description: `${after.x.toFixed(2)} / ${analytic.toFixed(2)}` },
  );

  expect(blocked).toBeGreaterThanOrEqual(BLOCK_MS);
  // What the compositor drew while JavaScript could not run: the box kept moving, frame after frame, and never backwards...
  expect(during.length).toBeGreaterThanOrEqual(MIN_BLOCKED_FRAMES);
  expect(distinct).toBeGreaterThanOrEqual(MIN_BLOCKED_FRAMES);
  expect(compositorEdges).toEqual([...compositorEdges].sort((a, b) => a - b));
  // ...while the identical spring on the JS driver stood still, since it only moves inside animation frames.
  expect(new Set(edges.map((entry) => entry.js)).size).toBe(1);

  // The timeline kept running through the block, and the element is where the spring is at that playback time.
  expect(after.playState).toBe("running");
  expect(after.playback - started).toBeGreaterThanOrEqual(blocked - CLOCK_SLACK_MS);
  expect(Math.abs(after.x - analytic)).toBeLessThanOrEqual(SAMPLING_TOLERANCE_PX);
  // Both drivers end on the target.
  expect(final).toEqual({ compositor: 300, js: 300 });
});

test("a compositor animation retargeted mid-flight keeps its velocity and turns back without a jump", async ({
  page,
}, testInfo) => {
  await open(page, "compositor");

  const result = await page.evaluate(async (reversalFrame) => {
    const box = document.getElementById("compositor")!;
    const read = () => new DOMMatrix(getComputedStyle(box).transform).m41;
    const forward = window.damped.animate(box, { x: 300 }, { driver: window.damped.compositor });

    // The recorder runs after the library in every frame, so reversing inside its callback makes the next frame (index
    // `reversalFrame`) the first one that shows the reversal, whatever the real frame timing is.
    let backward = undefined as ReturnType<typeof window.damped.animate> | undefined;
    let reversalIndex = -1;
    // Web animations on the element just before and just after the reversal: the driver really is the compositor.
    const running = { before: 0, after: 0 };
    const recording = window.e2e.record(
      read,
      (samples) => {
        if (samples.length !== reversalFrame) return;
        reversalIndex = samples.length;
        running.before = box.getAnimations().length;
        backward = window.damped.animate(box, { x: 0 }, { driver: window.damped.compositor });
        running.after = box.getAnimations().length;
      },
    );

    await forward.finished;
    await backward!.finished;
    recording.stop();
    return {
      reversalIndex,
      running,
      positions: recording.samples.map((sample) => sample.value),
      final: { computed: read(), inline: new DOMMatrix(box.style.transform).m41, running: box.getAnimations().length },
    };
  }, REVERSAL_FRAME);

  const { positions, reversalIndex } = result;
  expect(reversalIndex).toBe(REVERSAL_FRAME);
  expect(result.running).toEqual({ before: 1, after: 1 });
  expect(positions.length).toBeGreaterThan(reversalIndex + MIN_FRAMES_AFTER_REVERSAL);
  expect(positions.length).toBeGreaterThan(MIN_FRAMES);

  const steps = positions.slice(1).map((value, index) => value - positions[index]!);
  const distances = steps.map(Math.abs);
  // steps[i] leads into frame i + 1, so frame `reversalIndex` is the first one that shows the reversal.
  const before = distances.slice(reversalIndex - 1 - BASELINE_FRAMES, reversalIndex - 1);
  const lastBefore = steps[reversalIndex - 2]!;
  const firstAfter = steps[reversalIndex - 1]!;
  const limit = JUMP_FACTOR * Math.max(...before);

  testInfo.annotations.push(
    { type: "last step before", description: `${lastBefore.toFixed(2)} px` },
    { type: "first step after", description: `${firstAfter.toFixed(2)} px` },
    { type: "baseline max step", description: `${Math.max(...before).toFixed(2)} px` },
    { type: "max step after", description: `${Math.max(...distances.slice(reversalIndex - 1)).toFixed(2)} px` },
  );

  expect(Math.max(...before)).toBeGreaterThan(MIN_BASELINE_PX);
  expect(lastBefore).toBeGreaterThan(0);
  // Velocity continuity: it keeps moving forward for a moment before turning back.
  expect(Math.sign(firstAfter), `first post-reversal step ${firstAfter}`).toBe(Math.sign(lastBefore));
  for (let i = reversalIndex - 1; i < distances.length; i++) {
    expect(distances[i]!, `displacement into frame ${i + 1}`).toBeLessThanOrEqual(limit);
  }
  expect(Math.min(...steps.slice(reversalIndex - 1))).toBeLessThan(0);

  expect(result.final).toEqual({ computed: 0, inline: 0, running: 0 });
});

test("between its sample points the drawn curve stays within tolerance of the analytic spring", async ({ page }, testInfo) => {
  await open(page, "compositor");

  const result = await page.evaluate(() => {
    const box = document.getElementById("compositor")!;
    window.damped.animate(box, { x: 300 }, { driver: window.damped.compositor });
    const animation = box.getAnimations()[0]!;
    const spring = window.damped.createSpring(0, 300, 0, { duration: 0.5, bounce: 0.15, restDelta: 0.01, restSpeed: 0.1 });
    const duration = Number(animation.effect!.getTiming().duration);
    // Scrubbing a paused animation reads the exact drawn value at any playback time, off the 60 Hz sample grid too.
    animation.pause();
    let worst = { time: 0, offset: 0 };
    for (let time = 0; time <= duration; time += 0.5) {
      animation.currentTime = time;
      const offset = new DOMMatrix(getComputedStyle(box).transform).m41 - spring.at(time / 1000).position;
      if (Math.abs(offset) > Math.abs(worst.offset)) worst = { time, offset };
    }
    return { duration, worst };
  });

  testInfo.annotations.push({
    type: "worst chord offset",
    description: `${result.worst.offset.toFixed(3)} px at ${result.worst.time} ms of ${result.duration.toFixed(0)} ms`,
  });
  expect(Math.abs(result.worst.offset)).toBeLessThanOrEqual(SAMPLING_TOLERANCE_PX);
});
