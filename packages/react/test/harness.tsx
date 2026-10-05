import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createScheduler, type Phase, type Scheduler } from "@damped/core";
import { createFakeSource } from "../../core/test/fake-frame-source";

// Must be set before React renders anything, or every act() warns.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: { root: Root; container: HTMLElement }[] = [];

export function mount(ui: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const entry = { root, container };
  roots.push(entry);
  const render = (next: ReactNode): void => {
    act(() => root.render(next));
  };
  render(ui);
  return {
    container,
    rerender: render,
    unmount() {
      act(() => root.unmount());
      roots.splice(roots.indexOf(entry), 1);
      container.remove();
    },
  };
}

export function cleanup(): void {
  for (const { root, container } of roots.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
}

/** A scheduler driven by hand, which also records every loop it is asked to start. */
export function createTestScheduler() {
  const fake = createFakeSource();
  const inner = createScheduler(fake.source);
  const log: string[] = [];
  const scheduler: Scheduler = {
    schedule: (phase: Phase, job) => inner.schedule(phase, job),
    loop(phase: Phase, job) {
      log.push(`loop:${phase}`);
      return inner.loop(phase, job);
    },
    get active() {
      return inner.active;
    },
  };
  return { fake, scheduler, log };
}

/** Runs `count` frames of 16 ms starting at `from`; returns the timestamp of the next frame. */
export function runFrames(fake: ReturnType<typeof createFakeSource>, count: number, from = 0): number {
  let timestamp = from;
  for (let i = 0; i < count; i++) {
    fake.flush(timestamp);
    timestamp += 16;
  }
  return timestamp;
}

/** Lets every pending promise reaction (and the re-render it triggers) run. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve));
  });
}

/** Runs frames until the scheduler idles, inside act() so a state update they cause is flushed. */
export async function drain(fake: ReturnType<typeof createFakeSource>, from = 0, step = 16, limit = 3000): Promise<number> {
  let timestamp = from;
  for (let i = 0; i < limit && fake.pending > 0; i++) {
    fake.flush(timestamp);
    timestamp += step;
  }
  await settle();
  return timestamp;
}
