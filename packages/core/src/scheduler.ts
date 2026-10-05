export interface FrameInfo {
  /** Frame timestamp in milliseconds, as reported by the frame source. */
  timestamp: number;
  /** Milliseconds since the previous frame; 0 on the first frame after waking. */
  delta: number;
}

export interface FrameSource {
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

export type Phase = "read" | "update" | "write";
export type FrameJob = (frame: FrameInfo) => void;

export interface Scheduler {
  /** Run `job` once in `phase` of the next frame (or of the current frame if that phase has not run yet). Returns a cancel function. */
  schedule(phase: Phase, job: FrameJob): () => void;
  /** Run `job` every frame in `phase` until it returns false or is cancelled. Returns a cancel function. */
  loop(phase: Phase, job: (frame: FrameInfo) => boolean): () => void;
  /** True while a frame is requested. */
  readonly active: boolean;
}

interface Entry {
  job: (frame: FrameInfo) => unknown;
  repeat: boolean;
  done: boolean;
}

const PHASES: readonly Phase[] = ["read", "update", "write"];
// Timer delay used when requestAnimationFrame is unavailable (~60 Hz).
const FALLBACK_FRAME_MS = 16;

export function createScheduler(source: FrameSource = defaultFrameSource()): Scheduler {
  const jobs: Record<Phase, Entry[]> = { read: [], update: [], write: [] };
  // Entries added while a phase runs collect here and join `jobs` once the phase finishes.
  const incoming: Record<Phase, Entry[]> = { read: [], update: [], write: [] };
  let live = 0;
  let handle: number | undefined;
  let lastTimestamp: number | undefined;
  let processing = false;
  let running = -1;

  const finish = (entry: Entry): void => {
    if (entry.done) return;
    entry.done = true;
    live--;
  };

  const request = (): void => {
    handle = source.request(onFrame);
  };

  // Drops bookkeeping for the next wake: the first frame after waking reports delta 0.
  const reset = (): void => {
    lastTimestamp = undefined;
    for (const phase of PHASES) {
      jobs[phase].length = 0;
      incoming[phase].length = 0;
    }
  };

  const sleep = (): void => {
    if (handle !== undefined) source.cancel(handle);
    handle = undefined;
    reset();
  };

  const runPhase = (phase: Phase, frame: FrameInfo): void => {
    const batch = jobs[phase];
    // Jobs that arrived after this phase last ran join it now, i.e. in the next frame.
    const added = incoming[phase];
    for (const entry of added) batch.push(entry);
    added.length = 0;
    let kept = 0;
    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i]!;
      if (entry.done) continue;
      let keep = false;
      try {
        keep = entry.job(frame) !== false && entry.repeat;
      } catch (error) {
        // A failing job is dropped; the error surfaces without aborting the rest of the frame.
        queueMicrotask(() => {
          throw error;
        });
      }
      if (keep && !entry.done) batch[kept++] = entry;
      else finish(entry);
    }
    batch.length = kept;
  };

  function onFrame(timestamp: number): void {
    handle = undefined;
    const frame: FrameInfo = { timestamp, delta: lastTimestamp === undefined ? 0 : timestamp - lastTimestamp };
    lastTimestamp = timestamp;
    processing = true;
    for (const phase of PHASES) {
      running = PHASES.indexOf(phase);
      runPhase(phase, frame);
    }
    processing = false;
    if (live > 0) request();
    else reset();
  }

  const add = (phase: Phase, job: (frame: FrameInfo) => unknown, repeat: boolean): (() => void) => {
    const order = PHASES.indexOf(phase);
    if (order < 0) throw new RangeError(`unknown phase "${phase}"`);
    const entry: Entry = { job, repeat, done: false };
    // While a frame runs, only phases that have not started yet may take the job into this frame.
    const sameFrame = !processing || order > running;
    (sameFrame ? jobs : incoming)[phase].push(entry);
    live++;
    if (!processing && handle === undefined) request();
    return () => {
      if (entry.done) return;
      finish(entry);
      if (live === 0 && !processing) sleep();
    };
  };

  return {
    schedule: (phase, job) => add(phase, job, false),
    loop: (phase, job) => add(phase, job, true),
    get active() {
      return handle !== undefined;
    },
  };
}

function defaultFrameSource(): FrameSource {
  if (typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function") {
    return {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    };
  }

  const now = (): number => (typeof performance === "object" ? performance.now() : Date.now());
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let nextHandle = 1;
  return {
    request(callback) {
      const id = nextHandle++;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          callback(now());
        }, FALLBACK_FRAME_MS),
      );
      return id;
    },
    cancel(id) {
      clearTimeout(timers.get(id));
      timers.delete(id);
    },
  };
}

let shared: Scheduler | undefined;
const sharedScheduler = (): Scheduler => (shared ??= createScheduler());

/** Shared scheduler backed by `requestAnimationFrame`; created on first use so importing never touches `window`. */
export const frame: Scheduler = {
  schedule: (phase, job) => sharedScheduler().schedule(phase, job),
  loop: (phase, job) => sharedScheduler().loop(phase, job),
  get active() {
    return shared?.active ?? false;
  },
};
