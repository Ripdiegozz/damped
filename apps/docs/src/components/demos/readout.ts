const MINUS = "−";

/** "+412 px/s", "−88 px/s", "0 px/s": whole pixels, explicit sign, no negative zero. */
export function formatVelocity(velocity: number): string {
  const rounded = Math.round(velocity);
  if (rounded === 0) return "0 px/s";
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(rounded)} px/s`;
}

/** "12.3 px", never "-0.0 px". */
export function formatPixels(value: number): string {
  const text = Math.abs(value).toFixed(1);
  return `${value < 0 && Number(text) !== 0 ? MINUS : ""}${text} px`;
}

export interface TraceBox {
  width: number;
  height: number;
}

export interface Trace {
  readonly size: number;
  push(time: number, value: number): void;
  /** Notes a retarget at `time`, drawn as a vertical tick. */
  mark(time: number): void;
  clear(): void;
  /** SVG path data for the last `windowMs`: the line, the tick marks, and the y of the zero line. */
  path(box: TraceBox): { line: string; marks: string; zeroY: number };
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** A sliding window of (time, value) samples that draws itself as a signed line around a zero line. */
export function createTrace(windowMs: number): Trace {
  let samples: { time: number; value: number }[] = [];
  let marks: number[] = [];

  const trim = (now: number): void => {
    const oldest = now - windowMs;
    // Keeps one sample before the window so the line reaches the left edge.
    let first = 0;
    while (first + 1 < samples.length && samples[first + 1]!.time <= oldest) first++;
    if (first > 0) samples = samples.slice(first);
    marks = marks.filter((time) => time >= oldest);
  };

  return {
    get size() {
      return samples.length;
    },
    push(time, value) {
      samples.push({ time, value });
      trim(time);
    },
    mark(time) {
      marks.push(time);
    },
    clear() {
      samples = [];
      marks = [];
    },
    path({ width, height }) {
      const zeroY = height / 2;
      const last = samples.at(-1);
      if (samples.length < 2 || last === undefined) return { line: "", marks: "", zeroY };
      const start = last.time - windowMs;
      const peak = Math.max(100, ...samples.map((sample) => Math.abs(sample.value)));
      const x = (time: number): number => ((time - start) / windowMs) * width;
      const y = (value: number): number => zeroY - (value / peak) * (zeroY - 1);
      const line = samples
        .map((sample, index) => `${index === 0 ? "M" : "L"}${round(Math.max(0, x(sample.time)))} ${round(y(sample.value))}`)
        .join(" ");
      const ticks = marks.map((time) => `M${round(x(time))} 0 V${height}`).join(" ");
      return { line, marks: ticks, zeroY };
    },
  };
}
