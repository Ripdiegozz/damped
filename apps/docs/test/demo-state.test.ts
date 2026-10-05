import { describe, expect, test } from "bun:test";
import { createDemoState, type DemoState } from "../src/components/demos/demo-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flush = () => new Promise((resolve) => setTimeout(resolve));

function setup() {
  const seen: { state: DemoState; runs: number }[] = [];
  const demo = createDemoState((state, runs) => seen.push({ state, runs }));
  return { demo, seen };
}

describe("createDemoState", () => {
  test("starts idle and reports nothing until something is tracked", () => {
    const { demo, seen } = setup();
    expect(demo.state).toBe("idle");
    expect(demo.runs).toBe(0);
    expect(seen).toEqual([]);
  });

  test("is animating while a tracked animation is pending and settled once it settles", async () => {
    const { demo, seen } = setup();
    const run = deferred<boolean>();
    demo.track(run.promise);
    expect(demo.state).toBe("animating");
    expect(demo.runs).toBe(1);
    run.resolve(true);
    await flush();
    expect(demo.state).toBe("settled");
    expect(seen.map((entry) => entry.state)).toEqual(["animating", "settled"]);
  });

  test("a superseded animation does not settle the demo while its replacement still runs", async () => {
    const { demo } = setup();
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    demo.track(first.promise);
    demo.track(second.promise);
    expect(demo.runs).toBe(2);
    first.resolve(false);
    await flush();
    expect(demo.state).toBe("animating");
    second.resolve(true);
    await flush();
    expect(demo.state).toBe("settled");
  });

  test("a rejected promise still ends the run, so a failure never leaves the demo animating", async () => {
    const { demo } = setup();
    const run = deferred<boolean>();
    demo.track(run.promise.then(() => Promise.reject(new Error("boom"))));
    run.resolve(true);
    await flush();
    expect(demo.state).toBe("settled");
  });

  test("a new run after settling goes back to animating and counts again", async () => {
    const { demo } = setup();
    demo.track(Promise.resolve(true));
    await flush();
    expect(demo.state).toBe("settled");
    demo.track(deferred<boolean>().promise);
    expect(demo.state).toBe("animating");
    expect(demo.runs).toBe(2);
  });

  test("track resolves with the value of the tracked promise", async () => {
    const { demo } = setup();
    expect(await demo.track(Promise.resolve(false))).toBe(false);
  });

  test("tracking nothing at all settles an idle demo only after a run, never before", () => {
    const { demo } = setup();
    demo.settle();
    expect(demo.state).toBe("idle");
  });

  test("settle() ends an animation that has no promise, such as a timer-driven one", () => {
    const { demo } = setup();
    demo.begin();
    expect(demo.state).toBe("animating");
    demo.settle();
    expect(demo.state).toBe("settled");
  });
});
