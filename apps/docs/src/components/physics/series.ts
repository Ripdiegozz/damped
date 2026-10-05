export interface SeriesBox {
  width: number;
  height: number;
}

export interface SeriesRange {
  min: number;
  max: number;
}

export interface Series {
  readonly size: number;
  push(time: number, value: number): void;
  /** Notes an event at `time`, drawn as a vertical tick. */
  mark(time: number): void;
  clear(): void;
  /**
   * SVG path data for the last `windowMs` ending at `now` (the newest sample by default). Values map onto the height
   * through `range` and are clamped to the plot. Several series can share one clock by passing the same `now`.
   */
  path(box: SeriesBox, range: SeriesRange, now?: number): { line: string; marks: string; zeroY: number };
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** A sliding window of (time, value) samples with a fixed vertical range, so an axis never rescales under the reader. */
export function createSeries(windowMs: number): Series {
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
    path({ width, height }, { min, max }, now) {
      const span = max - min || 1;
      const y = (value: number): number => round(height - ((Math.min(max, Math.max(min, value)) - min) / span) * height);
      const zeroY = round(height - ((0 - min) / span) * height);
      const last = samples.at(-1);
      if (samples.length < 2 || last === undefined) return { line: "", marks: "", zeroY };
      const end = now ?? last.time;
      const start = end - windowMs;
      const x = (time: number): number => round(Math.max(0, ((time - start) / windowMs) * width));
      const line = samples.map((sample, index) => `${index === 0 ? "M" : "L"}${x(sample.time)} ${y(sample.value)}`).join(" ");
      const ticks = marks.filter((time) => time >= start).map((time) => `M${x(time)} 0 V${height}`).join(" ");
      return { line, marks: ticks, zeroY };
    },
  };
}
