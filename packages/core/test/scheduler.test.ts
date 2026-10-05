import { afterEach, describe, expect, test } from "bun:test";
import { createSpring } from "../src/spring";
import { createFakeSource } from "./fake-frame-source";
import { createScheduler, type FrameInfo, type Scheduler } from "../src/scheduler";

function setup() {
  const fake = createFakeSource();
  return { fake, scheduler: createScheduler(fake.source) };
}

describe("phases", () => {
  test("one-shot jobs run read, update, write regardless of scheduling order", () => {
    const { fake, scheduler } = setup();
    const log: string[] = [];
    scheduler.schedule("write", () => log.push("write"));
    scheduler.schedule("read", () => log.push("read"));
    scheduler.schedule("update", () => log.push("update"));
    fake.flush(0);
    expect(log).toEqual(["read", "update", "write"]);
  });

  test("loop jobs run read, update, write on every frame", () => {
    const { fake, scheduler } = setup();
    const log: string[] = [];
    scheduler.loop("write", () => (log.push("write"), true));
    scheduler.loop("update", () => (log.push("update"), true));
    scheduler.loop("read", () => (log.push("read"), true));
    fake.flush(0);
    fake.flush(16);
    expect(log).toEqual(["read", "update", "write", "read", "update", "write"]);
  });

  test("jobs in the same phase run in registration order and share one frame object", () => {
    const { fake, scheduler } = setup();
    const frames: FrameInfo[] = [];
    const log: string[] = [];
    scheduler.schedule("update", (frame) => (log.push("a"), frames.push(frame)));
    scheduler.loop("update", (frame) => (log.push("b"), frames.push(frame), false));
    scheduler.schedule("update", (frame) => (log.push("c"), frames.push(frame)));
    fake.flush(5);
    expect(log).toEqual(["a", "b", "c"]);
    expect(frames[1]).toBe(frames[0]!);
    expect(frames[2]).toBe(frames[0]!);
  });

  const midFrame: [string, "read" | "update" | "write", "read" | "update" | "write", "same" | "next"][] = [
    ["read schedules update", "read", "update", "same"],
    ["read schedules write", "read", "write", "same"],
    ["update schedules write", "update", "write", "same"],
    ["read schedules read", "read", "read", "next"],
    ["update schedules read", "update", "read", "next"],
    ["update schedules update", "update", "update", "next"],
    ["write schedules read", "write", "read", "next"],
    ["write schedules update", "write", "update", "next"],
    ["write schedules write", "write", "write", "next"],
  ];

  for (const [name, from, to, expected] of midFrame) {
    test(`${name}: runs in the ${expected} frame`, () => {
      const { fake, scheduler } = setup();
      const log: string[] = [];
      scheduler.schedule(from, () => {
        scheduler.schedule(to, (frame) => log.push(`child@${frame.timestamp}`));
      });
      fake.flush(10);
      if (expected === "same") {
        expect(log).toEqual(["child@10"]);
        expect(fake.pending).toBe(0);
      } else {
        expect(log).toEqual([]);
        expect(fake.pending).toBe(1);
        fake.flush(26);
        expect(log).toEqual(["child@26"]);
      }
    });
  }

  test("a job scheduled during a frame never runs twice in that frame", () => {
    const { fake, scheduler } = setup();
    let runs = 0;
    scheduler.loop("read", () => {
      runs++;
      scheduler.schedule("read", () => {});
      return runs < 3;
    });
    fake.flush(0);
    expect(runs).toBe(1);
  });
});

describe("validation", () => {
  test("an unknown phase throws RangeError without leaving a frame requested", () => {
    const { fake, scheduler } = setup();
    expect(() => scheduler.schedule("paint" as never, () => {})).toThrow(RangeError);
    expect(fake.requests).toBe(0);
    expect(scheduler.active).toBe(false);
  });
});

describe("sleeping and waking", () => {
  test("requests no frame while there are no jobs", () => {
    const { fake, scheduler } = setup();
    expect(scheduler.active).toBe(false);
    expect(fake.requests).toBe(0);
    expect(fake.pending).toBe(0);
  });

  test("scheduling requests exactly one frame, however many jobs are added", () => {
    const { fake, scheduler } = setup();
    scheduler.schedule("read", () => {});
    scheduler.schedule("write", () => {});
    scheduler.loop("update", () => true);
    expect(scheduler.active).toBe(true);
    expect(fake.requests).toBe(1);
    expect(fake.pending).toBe(1);
  });

  test("a one-shot job leaves the scheduler asleep after it runs", () => {
    const { fake, scheduler } = setup();
    scheduler.schedule("write", () => {});
    fake.flush(0);
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
    expect(fake.requests).toBe(1);
  });

  test("a running loop requests exactly one frame per frame", () => {
    const { fake, scheduler } = setup();
    scheduler.loop("update", () => true);
    scheduler.schedule("read", () => {});
    for (let i = 0; i < 5; i++) {
      expect(fake.pending).toBe(1);
      fake.flush(i * 16);
    }
    expect(fake.requests).toBe(6);
    expect(fake.pending).toBe(1);
  });

  test("sleeps after the last loop job returns false", () => {
    const { fake, scheduler } = setup();
    let remaining = 3;
    scheduler.loop("update", () => --remaining > 0);
    fake.flush(0);
    fake.flush(16);
    expect(scheduler.active).toBe(true);
    fake.flush(32);
    expect(remaining).toBe(0);
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
    expect(fake.requests).toBe(3);
  });

  test("cancelling the last job withdraws the pending frame request", () => {
    const { fake, scheduler } = setup();
    const cancel = scheduler.loop("update", () => true);
    fake.flush(0);
    expect(scheduler.active).toBe(true);
    cancel();
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
    expect(fake.cancels).toBe(1);
  });

  test("cancelling one of several jobs keeps the frame request", () => {
    const { fake, scheduler } = setup();
    const cancelFirst = scheduler.loop("update", () => true);
    scheduler.loop("update", () => true);
    cancelFirst();
    expect(scheduler.active).toBe(true);
    expect(fake.pending).toBe(1);
    expect(fake.cancels).toBe(0);
  });

  test("scheduling after sleeping wakes up with a single new request", () => {
    const { fake, scheduler } = setup();
    scheduler.schedule("read", () => {});
    fake.flush(0);
    expect(fake.requests).toBe(1);

    scheduler.schedule("read", () => {});
    scheduler.schedule("write", () => {});
    expect(fake.requests).toBe(2);
    expect(fake.pending).toBe(1);

    const cancel = scheduler.loop("update", () => true);
    cancel();
    expect(scheduler.active).toBe(true);
    scheduler.loop("update", () => true);
    expect(fake.requests).toBe(2);
    expect(fake.pending).toBe(1);
  });

  test("cancel then reschedule before the next frame does not duplicate requests", () => {
    const { fake, scheduler } = setup();
    scheduler.loop("update", () => true)();
    scheduler.loop("update", () => true);
    expect(fake.pending).toBe(1);
    expect(fake.requests).toBe(2);
  });
});

describe("delta", () => {
  test("is 0 on the first frame and the timestamp difference afterwards", () => {
    const { fake, scheduler } = setup();
    const frames: FrameInfo[] = [];
    scheduler.loop("update", (frame) => (frames.push(frame), true));
    for (const timestamp of [1000, 1016.5, 1033, 1100]) fake.flush(timestamp);
    expect(frames.map((f) => f.timestamp)).toEqual([1000, 1016.5, 1033, 1100]);
    expect(frames.map((f) => f.delta)).toEqual([0, 16.5, 16.5, 67]);
  });

  test("is 0 again on the first frame after waking from idle", () => {
    const { fake, scheduler } = setup();
    const deltas: number[] = [];
    const record = (frame: FrameInfo) => {
      deltas.push(frame.delta);
    };
    scheduler.schedule("update", record);
    fake.flush(100);
    scheduler.schedule("update", record);
    fake.flush(5000);
    expect(deltas).toEqual([0, 0]);
  });

  test("is 0 after the scheduler was put to sleep by cancelling", () => {
    const { fake, scheduler } = setup();
    const deltas: number[] = [];
    const cancel = scheduler.loop("update", (frame) => (deltas.push(frame.delta), true));
    fake.flush(100);
    fake.flush(116);
    cancel();
    scheduler.loop("update", (frame) => (deltas.push(frame.delta), false));
    fake.flush(9000);
    expect(deltas).toEqual([0, 16, 0]);
  });

  test("a job added between frames sees the delta of the frame it joins", () => {
    const { fake, scheduler } = setup();
    const deltas: number[] = [];
    scheduler.loop("update", () => true);
    fake.flush(0);
    scheduler.schedule("write", (frame) => deltas.push(frame.delta));
    fake.flush(16);
    expect(deltas).toEqual([16]);
  });
});

describe("cancellation", () => {
  test("cancelling a one-shot before it runs prevents it", () => {
    const { fake, scheduler } = setup();
    let ran = false;
    const cancel = scheduler.schedule("read", () => {
      ran = true;
    });
    cancel();
    fake.flush(0);
    expect(ran).toBe(false);
    expect(scheduler.active).toBe(false);
  });

  test("cancelling twice, or after the job ran, is harmless", () => {
    const { fake, scheduler } = setup();
    let runs = 0;
    const cancel = scheduler.schedule("read", () => {
      runs++;
    });
    scheduler.loop("write", () => true);
    fake.flush(0);
    cancel();
    cancel();
    expect(runs).toBe(1);
    expect(scheduler.active).toBe(true);
  });

  test("a loop can cancel itself from inside its own job", () => {
    const { fake, scheduler } = setup();
    let runs = 0;
    const cancel = scheduler.loop("update", () => {
      runs++;
      cancel();
      return true;
    });
    fake.flush(0);
    fake.flush(16);
    expect(runs).toBe(1);
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
  });

  test("a job can cancel a later job in the same frame before it runs", () => {
    const { fake, scheduler } = setup();
    const log: string[] = [];
    const cancelWrite = scheduler.loop("write", () => (log.push("write"), true));
    scheduler.schedule("read", () => {
      log.push("read");
      cancelWrite();
    });
    fake.flush(0);
    expect(log).toEqual(["read"]);
    expect(scheduler.active).toBe(false);
  });

  test("a job can cancel an earlier loop; later frames skip it", () => {
    const { fake, scheduler } = setup();
    const log: string[] = [];
    const cancelRead = scheduler.loop("read", () => (log.push("read"), true));
    let frames = 0;
    scheduler.loop("write", () => {
      log.push("write");
      if (++frames === 2) cancelRead();
      return true;
    });
    for (let i = 0; i < 4; i++) fake.flush(i * 16);
    expect(log).toEqual(["read", "write", "read", "write", "write", "write"]);
  });

  test("a job cancelled by a sibling in the same phase does not run", () => {
    const { fake, scheduler } = setup();
    const log: string[] = [];
    let cancelSecond = () => {};
    scheduler.schedule("update", () => {
      log.push("first");
      cancelSecond();
    });
    cancelSecond = scheduler.schedule("update", () => log.push("second"));
    scheduler.schedule("update", () => log.push("third"));
    fake.flush(0);
    expect(log).toEqual(["first", "third"]);
  });

  test("cancelling a job scheduled during a frame before the next frame prevents it", () => {
    const { fake, scheduler } = setup();
    let ran = false;
    scheduler.schedule("write", () => {
      const cancel = scheduler.schedule("read", () => {
        ran = true;
      });
      cancel();
    });
    fake.flush(0);
    expect(ran).toBe(false);
    expect(scheduler.active).toBe(false);
  });
});

describe("error handling", () => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  afterEach(() => {
    globalThis.queueMicrotask = originalQueueMicrotask;
  });

  function stubMicrotasks() {
    const queued: (() => void)[] = [];
    globalThis.queueMicrotask = (callback) => {
      queued.push(callback);
    };
    return queued;
  }

  test("a throwing job does not stop the other jobs in the frame", () => {
    const { fake, scheduler } = setup();
    stubMicrotasks();
    const log: string[] = [];
    scheduler.schedule("read", () => log.push("read"));
    scheduler.schedule("update", () => {
      throw new Error("boom");
    });
    scheduler.schedule("update", () => log.push("update2"));
    scheduler.schedule("write", () => log.push("write"));
    expect(() => fake.flush(0)).not.toThrow();
    expect(log).toEqual(["read", "update2", "write"]);
  });

  test("the error is re-thrown asynchronously and is not swallowed", () => {
    const { fake, scheduler } = setup();
    const queued = stubMicrotasks();
    const error = new Error("boom");
    scheduler.schedule("update", () => {
      throw error;
    });
    fake.flush(0);
    expect(queued).toHaveLength(1);
    expect(() => queued[0]!()).toThrow(error);
  });

  test("every failing job is reported", () => {
    const { fake, scheduler } = setup();
    const queued = stubMicrotasks();
    scheduler.schedule("read", () => {
      throw new Error("first");
    });
    scheduler.schedule("write", () => {
      throw new Error("second");
    });
    fake.flush(0);
    expect(queued).toHaveLength(2);
  });

  test("the scheduler keeps working after a job throws", () => {
    const { fake, scheduler } = setup();
    stubMicrotasks();
    const log: string[] = [];
    scheduler.loop("update", () => (log.push("loop"), true));
    scheduler.schedule("read", () => {
      throw new Error("boom");
    });
    fake.flush(0);
    expect(fake.pending).toBe(1);
    fake.flush(16);
    expect(log).toEqual(["loop", "loop"]);
  });

  test("a loop job that throws is removed instead of failing every frame", () => {
    const { fake, scheduler } = setup();
    const queued = stubMicrotasks();
    let runs = 0;
    scheduler.loop("update", () => {
      runs++;
      throw new Error("boom");
    });
    fake.flush(0);
    expect(runs).toBe(1);
    expect(queued).toHaveLength(1);
    expect(scheduler.active).toBe(false);
  });
});

describe("frame-rate independence through the scheduler", () => {
  const SPRING_OPTIONS = { duration: 0.5, bounce: 0.2 };
  const START = 10_000;
  const CHECKPOINTS = [250, 500];

  const uniform = (hz: number): number[] => {
    const stamps: number[] = [];
    for (let i = 0; (i * 1000) / hz <= 500 + 1e-9; i++) stamps.push(START + (i * 1000) / hz);
    return stamps;
  };

  // Integer-millisecond steps of uneven size, clipped so every checkpoint is hit exactly.
  const irregular = (): number[] => {
    const steps = [3, 11, 16, 7, 29, 5, 23, 13];
    const stamps: number[] = [START];
    let now = 0;
    let i = 0;
    while (now < 500) {
      const nextCheckpoint = CHECKPOINTS.find((c) => c > now)!;
      now += Math.min(steps[i++ % steps.length]!, nextCheckpoint - now);
      stamps.push(START + now);
    }
    return stamps;
  };

  interface Sample {
    timestamp: number;
    position: number;
    velocity: number;
  }

  // Drives `advance` from a loop job through a fake source flushed at `timestamps`.
  function drive(
    timestamps: number[],
    advance: (frame: FrameInfo, start: number) => { position: number; velocity: number },
  ): Sample[] {
    const fake = createFakeSource();
    const scheduler: Scheduler = createScheduler(fake.source);
    const samples: Sample[] = [];
    let start: number | undefined;
    scheduler.loop("update", (frame) => {
      start ??= frame.timestamp;
      samples.push({ timestamp: frame.timestamp, ...advance(frame, start) });
      return true;
    });
    for (const timestamp of timestamps) fake.flush(timestamp);
    return samples;
  }

  const analytic = () => {
    const spring = createSpring(0, 1, 0, SPRING_OPTIONS);
    return (frame: FrameInfo, start: number) => spring.at((frame.timestamp - start) / 1000);
  };

  // Naive explicit Euler stepping with the frame delta, the approach the analytic solver replaces.
  const euler = () => {
    const { stiffness, damping, mass } = createSpring(0, 1, 0, SPRING_OPTIONS).params;
    let position = 0;
    let velocity = 0;
    return (frame: FrameInfo) => {
      const dt = frame.delta / 1000;
      const acceleration = (-stiffness * (position - 1) - damping * velocity) / mass;
      position += velocity * dt;
      velocity += acceleration * dt;
      return { position, velocity };
    };
  };

  const at = (samples: Sample[], offset: number): Sample => {
    const sample = samples.find((s) => Math.abs(s.timestamp - (START + offset)) < 1e-6);
    if (!sample) throw new Error(`no frame at offset ${offset}`);
    return sample;
  };

  test("the cadences are genuinely different and share the checkpoints", () => {
    const cadences = [uniform(60), uniform(144), irregular()];
    expect(new Set(cadences.map((c) => c.length)).size).toBe(3);
    const irregularDeltas = new Set(irregular().map((t, i, all) => (i === 0 ? 0 : t - all[i - 1]!)));
    expect(irregularDeltas.size).toBeGreaterThan(4);
    for (const stamps of cadences) {
      for (const checkpoint of CHECKPOINTS) {
        expect(stamps.some((t) => Math.abs(t - (START + checkpoint)) < 1e-6)).toBe(true);
      }
    }
  });

  test("an analytic loop observes the same state at 60 Hz, 144 Hz and an irregular cadence", () => {
    const runs = [uniform(60), uniform(144), irregular()].map((stamps) => drive(stamps, analytic()));
    for (const checkpoint of CHECKPOINTS) {
      const [a, b, c] = runs.map((samples) => at(samples, checkpoint)) as [Sample, Sample, Sample];
      expect(Math.abs(a.position - b.position)).toBeLessThan(1e-12);
      expect(Math.abs(a.position - c.position)).toBeLessThan(1e-12);
      expect(Math.abs(a.velocity - b.velocity)).toBeLessThan(1e-12);
      expect(Math.abs(a.velocity - c.velocity)).toBeLessThan(1e-12);
    }
  });

  test("the observed state is the spring state at the elapsed time", () => {
    const spring = createSpring(0, 1, 0, SPRING_OPTIONS);
    const sample = at(drive(irregular(), analytic()), 250);
    expect(sample.position).toBeCloseTo(spring.at(0.25).position, 12);
    expect(sample.position).not.toBeCloseTo(1, 3);
  });

  test("naive per-frame Euler stepping diverges across frame rates, so the check can detect it", () => {
    const [a, b] = [uniform(60), uniform(144)].map((stamps) => at(drive(stamps, euler()), 500)) as [Sample, Sample];
    expect(Math.abs(a.position - b.position)).toBeGreaterThan(1e-3);

    const exact = at(drive(uniform(60), analytic()), 500);
    expect(Math.abs(a.position - exact.position)).toBeGreaterThan(1e-3);
  });
});

describe("default frame instance", () => {
  const BROWSER_GLOBALS = ["requestAnimationFrame", "cancelAnimationFrame", "window", "document"] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  let imports = 0;

  const hideBrowserGlobals = () => {
    for (const key of BROWSER_GLOBALS) {
      if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Reflect.deleteProperty(globalThis, key);
    }
  };

  const defineGlobal = (key: string, descriptor: PropertyDescriptor) => {
    if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, ...descriptor });
  };

  // A query string yields a fresh module instance, so each test gets its own lazy `frame`.
  const importFresh = async (): Promise<typeof import("../src/scheduler")> =>
    import(`${import.meta.dir}/../src/scheduler.ts?fresh=${imports++}`);

  afterEach(() => {
    for (const [key, descriptor] of saved) {
      Reflect.deleteProperty(globalThis, key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    }
    saved.clear();
  });

  test("importing without any browser globals does not throw", async () => {
    hideBrowserGlobals();
    const module = await importFresh();
    expect(module.frame.active).toBe(false);
  });

  test("the module does not touch the animation frame globals at import time", async () => {
    let reads = 0;
    for (const key of ["requestAnimationFrame", "cancelAnimationFrame", "window"]) {
      defineGlobal(key, {
        get() {
          reads++;
          return undefined;
        },
      });
    }
    const module = await importFresh();
    expect(module.frame.active).toBe(false);
    expect(reads).toBe(0);
  });

  test("uses requestAnimationFrame and cancelAnimationFrame when available", async () => {
    const callbacks = new Map<number, (timestamp: number) => void>();
    let nextHandle = 1;
    const cancelled: number[] = [];
    defineGlobal("requestAnimationFrame", {
      value: (callback: (timestamp: number) => void) => {
        callbacks.set(nextHandle, callback);
        return nextHandle++;
      },
    });
    defineGlobal("cancelAnimationFrame", {
      value: (handle: number) => {
        cancelled.push(handle);
        callbacks.delete(handle);
      },
    });
    const { frame } = await importFresh();
    const seen: FrameInfo[] = [];

    frame.schedule("write", (info) => seen.push(info));
    expect(frame.active).toBe(true);
    expect(callbacks.size).toBe(1);
    const fire = callbacks.get(1)!;
    callbacks.delete(1);
    fire(250);
    expect(seen).toEqual([{ timestamp: 250, delta: 0 }]);
    expect(frame.active).toBe(false);

    const cancel = frame.loop("update", () => true);
    expect(callbacks.size).toBe(1);
    cancel();
    expect(cancelled).toEqual([2]);
    expect(frame.active).toBe(false);
  });

  test("falls back to a roughly 16 ms timer without animation frame support", async () => {
    // Half of the 16 ms fallback delay: loose enough to absorb timer jitter, tight enough to prove a real delay.
    const minimumDelay = 8;
    hideBrowserGlobals();
    const { frame } = await importFresh();
    const timestamps: number[] = [];
    const deltas: number[] = [];
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      frame.loop("update", (info) => {
        timestamps.push(info.timestamp);
        deltas.push(info.delta);
        if (timestamps.length < 3) return true;
        resolve();
        return false;
      });
    });
    expect(deltas[0]).toBe(0);
    for (const delta of deltas.slice(1)) expect(delta).toBeGreaterThan(minimumDelay);
    expect(timestamps[0]! - startedAt).toBeGreaterThan(minimumDelay);
    expect(frame.active).toBe(false);
  });

  test("the fallback timer can be cancelled", async () => {
    hideBrowserGlobals();
    const { frame } = await importFresh();
    let ran = false;
    frame.schedule("read", () => {
      ran = true;
    })();
    expect(frame.active).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(ran).toBe(false);
  });
});
