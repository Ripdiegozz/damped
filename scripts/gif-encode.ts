// Pure helpers behind scripts/record-demo.ts, kept apart so they can be tested.

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

const MIN_FRAME_S = 0.001;
const quote = (file: string): string => `'${file.replaceAll("'", "'\\''")}'`;

/**
 * An ffconcat list that plays the given frames for as long as each one was on screen, until `endTime` (seconds, on the
 * same clock as the frame times). The last file is listed again without a duration, which the demuxer needs in order
 * to honor the duration of the one before it.
 */
export function concatList(frames: readonly { file: string; time: number }[], endTime: number): string {
  if (frames.length === 0) throw new Error("no frames to list");
  const lines = ["ffconcat version 1.0"];
  frames.forEach((frame, index) => {
    const next = frames[index + 1]?.time ?? endTime;
    lines.push(`file ${quote(frame.file)}`, `duration ${Math.max(next - frame.time, MIN_FRAME_S).toFixed(6)}`);
  });
  lines.push(`file ${quote(frames.at(-1)!.file)}`, "");
  return lines.join("\n");
}
