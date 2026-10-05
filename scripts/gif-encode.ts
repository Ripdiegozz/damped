// Pure helpers behind scripts/record-demo.ts, kept apart so they can be tested.

/** The frame rate ffprobe prints: a fraction such as `25/1`, or a plain number. */
export function parseFrameRate(text: string): number {
  const [numerator, denominator = 1] = text.trim().split("/").map(Number);
  const rate = numerator! / denominator;
  if (!(Number.isFinite(rate) && rate > 0)) throw new Error(`could not read a frame rate from "${text.trim()}"`);
  return rate;
}

/** A GIF rate above the recording's own would only repeat frames. */
export const chooseFps = (sourceFps: number, maxFps: number): number => Math.min(maxFps, Math.round(sourceFps));

/**
 * The part of the recording to keep, in seconds: from `leadIn` before the first action to `tail` after the last one.
 * Times are wall-clock milliseconds taken when the page was created, when the scene started and when it ended.
 */
export function trimWindow(
  times: { created: number; started: number; ended: number },
  leadIn: number,
  tail: number,
): { start: number; length: number } {
  const start = Math.max(0, (times.started - times.created) / 1000 - leadIn);
  return { start, length: (times.ended - times.started) / 1000 + leadIn + tail };
}

export const gifFilter = (fps: number, width: number): string => `fps=${fps},scale=${width}:-1:flags=lanczos`;
