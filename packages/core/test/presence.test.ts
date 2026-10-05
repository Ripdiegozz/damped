import { afterEach, describe, expect, test } from "bun:test";
import { animate, peekSpringValue } from "../src/animate";
import { enter, exit, type ExitOptions } from "../src/presence";
import { createScheduler } from "../src/scheduler";
import { createSpring } from "../src/spring";
import { createFakeSource } from "./fake-frame-source";
import { IDENTITY, LENGTH, RATIO, SPRING, createElement, flushAll, parseTransform, restoreMatchMedia, stubMatchMedia, trackWrites } from "./layout-world";

afterEach(restoreMatchMedia);

function setup() {
  const fake = createFakeSource();
  const scheduler = createScheduler(fake.source);
  const options = (extra: Partial<ExitOptions> = {}): ExitOptions => ({ ...SPRING, scheduler, ...extra });
  return { fake, scheduler, options };
}

const full = (x: number, y: number, rotate: number, scaleX: number, scaleY: number): string =>
  `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`;
const yOf = (element: HTMLElement): number => parseTransform(element.style.transform).y;

// Lets every pending promise reaction run.
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

// Runs the frames at 0, 16, ... `frames` times and returns the timestamp of the next frame.
function advance(fake: ReturnType<typeof createFakeSource>, frames: number): number {
  for (let i = 0; i < frames; i++) fake.flush(i * 16);
  return frames * 16;
}

describe("enter", () => {
  test("renders `from` on the first frame, then settles on the identity values with exact strings", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const controls = enter(element, { y: 40, opacity: 0, scale: 0.8, blur: 6 }, undefined, options());

    fake.flush(0);
    expect(element.style.transform).toBe(full(0, 40, 0, 0.8, 0.8));
    expect(element.style.opacity).toBe("0");
    expect(element.style.filter).toBe("blur(6px)");

    fake.flush(80);
    expect(yOf(element)).toBe(createSpring(40, 0, 0, LENGTH).at(0.08).position);
    expect(element.style.opacity).toBe(String(createSpring(0, 1, 0, RATIO).at(0.08).position));

    flushAll(fake, 96);
    await controls.finished;
    expect(element.style.transform).toBe(IDENTITY);
    expect(element.style.opacity).toBe("1");
    expect(element.style.filter).toBe("");
  });

  test("every property settles on its identity value", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const controls = enter(element, { x: 10, y: -10, rotate: 30, scale: 2, scaleX: 3, scaleY: 4, opacity: 0.5, blur: 4 }, {}, options());
    fake.flush(0);
    expect(element.style.transform).toBe(full(10, -10, 30, 6, 8));
    flushAll(fake, 16);
    await controls.finished;
    expect(element.style.transform).toBe(IDENTITY);
    expect(element.style.opacity).toBe("1");
    expect(element.style.filter).toBe("");
  });

  test("explicit `to` values override the identity defaults", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const controls = enter(element, { y: 20, opacity: 0 }, { opacity: 0.5, x: 12 }, options());
    flushAll(fake);
    await controls.finished;
    expect(element.style.transform).toBe(full(12, 0, 0, 1, 1));
    expect(element.style.opacity).toBe("0.5");
  });

  test("properties that are not mentioned are never written", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const writes = trackWrites(element);
    const controls = enter(element, { opacity: 0 }, undefined, options());
    flushAll(fake);
    await controls.finished;
    expect(writes.values("opacity").at(-1)).toBe("1");
    expect(writes.values("transform")).toEqual([]);
    expect(writes.values("filter")).toEqual([]);
  });

  test("a property that only `to` mentions animates from its current value", () => {
    const { fake, options } = setup();
    const element = createElement();
    enter(element, { opacity: 0 }, { x: 50 }, options());
    fake.flush(0);
    expect(element.style.transform).toBe(full(0, 0, 0, 1, 1));
    fake.flush(80);
    expect(parseTransform(element.style.transform).x).toBe(createSpring(0, 50, 0, LENGTH).at(0.08).position);
  });

  test("stop() freezes the entrance", () => {
    const { fake, scheduler, options } = setup();
    const element = createElement();
    const controls = enter(element, { y: 40 }, undefined, options());
    advance(fake, 4);
    const frozen = element.style.transform;
    controls.stop();
    flushAll(fake, 100);
    expect(element.style.transform).toBe(frozen);
    expect(scheduler.active).toBe(false);
  });

  test("an element that is already animating a targeted value is only retargeted, never jumped to `from`", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { y: 100 }, options());
    const next = advance(fake, 5);
    const before = yOf(element);
    expect(before).toBeGreaterThan(0);

    enter(element, { y: -50 }, undefined, options());
    fake.flush(next);
    expect(yOf(element)).toBeGreaterThan(before - 5);
    expect(yOf(element)).toBeGreaterThan(0);
  });

  test("a single animating targeted value is enough to retarget the whole element", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { opacity: 0 }, options());
    const next = advance(fake, 3);

    enter(element, { opacity: 0.2, y: 30 }, undefined, options());
    fake.flush(next);
    expect(yOf(element)).toBe(0);
    expect(peekSpringValue(element, "y")!.get()).toBe(0);
    expect(Number(element.style.opacity)).toBeLessThan(1);
  });

  test("animating values the call does not target do not count as in flight", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 100 }, options());
    const next = advance(fake, 3);

    enter(element, { y: 30 }, undefined, options());
    fake.flush(next);
    expect(yOf(element)).toBe(30);
  });

  test("each element of a list follows the rule on its own", () => {
    const { fake, options } = setup();
    const moving = createElement();
    const fresh = createElement();
    animate(moving, { y: 100 }, options());
    const next = advance(fake, 4);
    const before = yOf(moving);

    enter([moving, fresh], { y: -50 }, undefined, options());
    fake.flush(next);
    expect(yOf(fresh)).toBe(-50);
    expect(yOf(moving)).toBeGreaterThan(before - 5);
  });

  test("settled elements start from `from` again", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const first = enter(element, { y: 40 }, undefined, options());
    const next = flushAll(fake);
    await first.finished;
    expect(yOf(element)).toBe(0);

    enter(element, { y: 40 }, undefined, options());
    fake.flush(next);
    expect(yOf(element)).toBe(40);
  });

  test("reduced motion jumps the spatial properties and still animates opacity and blur", async () => {
    stubMatchMedia(true);
    const { fake, options } = setup();
    const element = createElement();
    const controls = enter(element, { x: 50, opacity: 0, blur: 6 }, undefined, options());
    fake.flush(0);
    expect(element.style.transform).toBe(IDENTITY);
    expect(element.style.opacity).toBe("0");
    expect(element.style.filter).toBe("blur(6px)");
    flushAll(fake, 16);
    await controls.finished;
    expect(element.style.opacity).toBe("1");
    expect(element.style.filter).toBe("");
  });
});

describe("exit", () => {
  test("animates to `to`, removes the element once it settles, and resolves true after the removal", async () => {
    const { fake, scheduler, options } = setup();
    const element = createElement();
    const controls = exit(element, { y: -40, opacity: 0 }, options());

    fake.flush(0);
    fake.flush(80);
    expect(yOf(element)).toBe(createSpring(0, -40, 0, LENGTH).at(0.08).position);
    expect(element.isConnected).toBe(true);

    flushAll(fake, 96);
    expect(element.style.transform).toBe(full(0, -40, 0, 1, 1));
    expect(element.style.opacity).toBe("0");

    const removed = controls.finished.then((completed) => ({ completed, connected: element.isConnected }));
    expect(await removed).toEqual({ completed: true, connected: false });
    expect(scheduler.active).toBe(false);
  });

  test("stays in the DOM while the exit runs", () => {
    const { fake, options } = setup();
    const element = createElement();
    exit(element, { opacity: 0 }, options());
    advance(fake, 10);
    expect(element.isConnected).toBe(true);
  });

  test("remove: false leaves the element in the DOM", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const controls = exit(element, { opacity: 0 }, options({ remove: false }));
    flushAll(fake);
    expect(await controls.finished).toBe(true);
    expect(element.isConnected).toBe(true);
    expect(element.style.opacity).toBe("0");
  });

  test("a remove function receives the element and replaces the removal", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const received: Element[] = [];
    const controls = exit(element, { opacity: 0 }, options({ remove: (target) => received.push(target) }));
    flushAll(fake);
    expect(await controls.finished).toBe(true);
    expect(received).toEqual([element]);
    expect(element.isConnected).toBe(true);
  });

  test("makes the element inert and hidden from assistive technology while it leaves", () => {
    const { fake, options } = setup();
    const element = createElement();
    exit(element, { opacity: 0 }, options());
    expect(element.inert).toBe(true);
    expect(element.getAttribute("aria-hidden")).toBe("true");
    advance(fake, 5);
    expect(element.inert).toBe(true);
    expect(element.getAttribute("aria-hidden")).toBe("true");
  });

  test("remove: false restores the attributes it found, not defaults", async () => {
    const { fake, options } = setup();
    const plain = createElement();
    const hiddenFalse = createElement();
    hiddenFalse.setAttribute("aria-hidden", "false");
    const alreadyInert = createElement();
    alreadyInert.inert = true;
    alreadyInert.setAttribute("aria-hidden", "true");

    const controls = exit([plain, hiddenFalse, alreadyInert], { opacity: 0 }, options({ remove: false }));
    expect(hiddenFalse.getAttribute("aria-hidden")).toBe("true");
    flushAll(fake);
    await controls.finished;

    expect(plain.inert).toBe(false);
    expect(plain.hasAttribute("aria-hidden")).toBe(false);
    expect(hiddenFalse.inert).toBe(false);
    expect(hiddenFalse.getAttribute("aria-hidden")).toBe("false");
    expect(alreadyInert.inert).toBe(true);
    expect(alreadyInert.getAttribute("aria-hidden")).toBe("true");
  });

  test("a remove function leaves a restored element behind", async () => {
    const { fake, options } = setup();
    const element = createElement();
    element.setAttribute("aria-hidden", "false");
    const controls = exit(element, { opacity: 0 }, options({ remove: () => undefined }));
    flushAll(fake);
    await controls.finished;
    expect(element.inert).toBe(false);
    expect(element.getAttribute("aria-hidden")).toBe("false");
  });

  test("stop() freezes the exit, resolves false, keeps the element and restores the attributes", async () => {
    const { fake, scheduler, options } = setup();
    const element = createElement();
    element.setAttribute("aria-hidden", "false");
    const controls = exit(element, { y: -100, opacity: 0 }, options());
    advance(fake, 4);
    const frozen = element.style.transform;
    expect(frozen).not.toBe(IDENTITY);

    controls.stop();
    expect(element.inert).toBe(false);
    expect(element.getAttribute("aria-hidden")).toBe("false");
    expect(await controls.finished).toBe(false);

    flushAll(fake, 100);
    expect(element.style.transform).toBe(frozen);
    expect(element.isConnected).toBe(true);
    expect(scheduler.active).toBe(false);
  });

  test("stop() after the exit completed does nothing", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const controls = exit(element, { opacity: 0 }, options());
    flushAll(fake);
    expect(await controls.finished).toBe(true);
    controls.stop();
    expect(element.isConnected).toBe(false);
    expect(element.inert).toBe(true);
  });

  test("reduced motion jumps the spatial properties and removes the element after the opacity has settled", async () => {
    stubMatchMedia(true);
    const { fake, options } = setup();
    const element = createElement();
    const controls = exit(element, { x: 100, opacity: 0 }, options());
    fake.flush(0);
    expect(element.style.transform).toBe(full(100, 0, 0, 1, 1));
    expect(element.style.opacity).toBe("1");
    expect(element.isConnected).toBe(true);

    flushAll(fake, 16);
    expect(await controls.finished).toBe(true);
    expect(element.style.opacity).toBe("0");
    expect(element.isConnected).toBe(false);
  });
});

describe("interruption", () => {
  test("enter() mid-exit cancels the removal, restores the attributes, resolves the exit false and keeps its velocity", async () => {
    const { fake, scheduler, options } = setup();
    const element = createElement();
    element.setAttribute("aria-hidden", "false");
    const leaving = exit(element, { y: -100 }, options());
    const next = advance(fake, 5);
    const before = yOf(element);
    const velocity = peekSpringValue(element, "y")!.getVelocity();
    expect(velocity).toBeLessThan(-100);

    const entering = enter(element, { y: 50 }, { y: 0 }, options());
    expect(element.inert).toBe(false);
    expect(element.getAttribute("aria-hidden")).toBe("false");

    fake.flush(next);
    expect(yOf(element)).toBe(createSpring(before, 0, velocity, LENGTH).at(0.016).position);
    expect(yOf(element)).toBeLessThan(before - 1);

    flushAll(fake, next + 16);
    await entering.finished;
    expect(await leaving.finished).toBe(false);
    expect(element.isConnected).toBe(true);
    expect(element.style.transform).toBe(IDENTITY);
    expect(scheduler.active).toBe(false);
  });

  test("a restart from rest would not move on the first step", () => {
    const { fake, options } = setup();
    const inherited = createElement();
    const restarted = createElement();
    // Same timeline for both: one of them keeps its velocity, the other is frozen first and so restarts from rest.
    exit(inherited, { y: -100 }, options());
    const leavingRestarted = exit(restarted, { y: -100 }, options());
    const next = advance(fake, 5);
    const before = yOf(inherited);
    leavingRestarted.stop();
    expect(yOf(restarted)).toBe(before);

    enter(inherited, {}, { y: 0 }, options());
    enter(restarted, {}, { y: 0 }, options());
    fake.flush(next);
    expect(yOf(restarted)).toBe(before);
    expect(Math.abs(yOf(inherited) - before)).toBeGreaterThan(1);
  });

  test("the properties an interrupted exit animated return to the identity when enter() does not mention them", async () => {
    const { fake, options } = setup();
    const element = createElement();
    exit(element, { y: -100, opacity: 0 }, options());
    advance(fake, 4);

    const entering = enter(element, { opacity: 0 }, undefined, options());
    flushAll(fake, 64);
    await entering.finished;
    expect(element.style.transform).toBe(IDENTITY);
    expect(element.style.opacity).toBe("1");
    expect(element.isConnected).toBe(true);
  });

  test("a second exit() supersedes the first: only the second removes", async () => {
    const { fake, options } = setup();
    const element = createElement();
    element.setAttribute("aria-hidden", "false");
    const removed: string[] = [];
    const first = exit(element, { y: -100 }, options({ remove: () => removed.push("first") }));
    const next = advance(fake, 4);

    const second = exit(element, { y: -200 }, options({ remove: false }));
    expect(element.inert).toBe(true);
    expect(await first.finished).toBe(false);

    flushAll(fake, next);
    expect(await second.finished).toBe(true);
    expect(removed).toEqual([]);
    expect(yOf(element)).toBe(-200);
    expect(element.isConnected).toBe(true);
    // The second exit captured the attributes the element had before the first one.
    expect(element.inert).toBe(false);
    expect(element.getAttribute("aria-hidden")).toBe("false");
  });

  test("a superseded exit's stop() does not touch the exit that replaced it", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const first = exit(element, { y: -100 }, options());
    advance(fake, 3);
    const second = exit(element, { y: -200 }, options());
    first.stop();
    expect(element.inert).toBe(true);

    flushAll(fake, 48);
    expect(await second.finished).toBe(true);
    expect(element.isConnected).toBe(false);
  });

  test("an animate() call that takes over an exiting value cancels the removal", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const leaving = exit(element, { opacity: 0 }, options());
    const next = advance(fake, 3);

    const takeover = animate(element, { opacity: 1 }, options());
    expect(await leaving.finished).toBe(false);
    expect(element.inert).toBe(false);
    expect(element.hasAttribute("aria-hidden")).toBe(false);

    flushAll(fake, next);
    await takeover.finished;
    expect(element.isConnected).toBe(true);
  });

  test("a failed enter() leaves a running exit alone", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const leaving = exit(element, { y: -100 }, options());
    advance(fake, 3);

    expect(() => enter(element, { x: 1 }, { opacity: Number.NaN }, options())).toThrow(RangeError);
    expect(element.inert).toBe(true);

    flushAll(fake, 48);
    expect(await leaving.finished).toBe(true);
    expect(element.isConnected).toBe(false);
  });
});

describe("multiple elements", () => {
  test("each element is removed when its own animation settles and finished waits for all", async () => {
    const { fake, options } = setup();
    const settled = createElement();
    const moving = createElement();
    animate(moving, { y: 200 }, options());
    const next = flushAll(fake);
    await tick();

    const controls = exit([settled, moving], { y: 0 }, options());
    let done = false;
    void controls.finished.then(() => {
      done = true;
    });
    await tick();
    expect(settled.isConnected).toBe(false);
    expect(moving.isConnected).toBe(true);
    expect(done).toBe(false);

    flushAll(fake, next);
    expect(await controls.finished).toBe(true);
    expect(moving.isConnected).toBe(false);
  });

  test("finished is false when any element was interrupted, while the others still complete", async () => {
    const { fake, options } = setup();
    const first = createElement();
    const second = createElement();
    const controls = exit([first, second], { y: -50 }, options());
    const next = advance(fake, 3);

    enter(second, {}, { y: 0 }, options());
    flushAll(fake, next);
    expect(await controls.finished).toBe(false);
    expect(first.isConnected).toBe(false);
    expect(second.isConnected).toBe(true);
    expect(second.inert).toBe(false);
  });

  test("stop() stops every element", async () => {
    const { fake, options } = setup();
    const elements = [createElement(), createElement()];
    const controls = exit(elements, { y: -50 }, options());
    advance(fake, 3);
    controls.stop();
    flushAll(fake, 100);
    expect(await controls.finished).toBe(false);
    expect(elements.map((element) => element.isConnected)).toEqual([true, true]);
  });
});

describe("validation", () => {
  test("invalid targets and spring options throw before any element is touched", () => {
    const { fake, options } = setup();
    const elements = [createElement(), createElement()];
    const writes = elements.map(trackWrites);
    const invalid: [() => unknown, unknown][] = [
      [() => exit(elements, { opacity: Number.NaN }, options()), RangeError],
      [() => exit(elements, { nope: 1 } as never, options()), TypeError],
      [() => exit(elements, { opacity: 0 }, options({ duration: -1 })), RangeError],
      [() => exit(elements, { opacity: 0 }, options({ stiffness: 100, damping: -1 } as never)), RangeError],
      [() => enter(elements, { opacity: Number.NaN }, undefined, options()), RangeError],
      [() => enter(elements, { nope: 1 } as never, undefined, options()), TypeError],
      [() => enter(elements, { opacity: 0 }, { x: Number.POSITIVE_INFINITY }, options()), RangeError],
      [() => enter(elements, { opacity: 0 }, { nope: 1 } as never, options()), TypeError],
      [() => enter(elements, { opacity: 0 }, undefined, options({ restDelta: 0 })), RangeError],
    ];
    for (const [call, error] of invalid) expect(call).toThrow(error as ErrorConstructor);

    for (const element of elements) {
      expect(element.inert).toBe(false);
      expect(element.hasAttribute("aria-hidden")).toBe(false);
      expect(element.isConnected).toBe(true);
    }
    expect(writes.map((entry) => entry.log)).toEqual([[], []]);
    expect(fake.requests).toBe(0);
  });
});

describe("idle", () => {
  test("the scheduler goes idle once every enter and exit has settled", async () => {
    const { fake, scheduler, options } = setup();
    const elements = [createElement(), createElement(), createElement()];
    const calls = [
      enter(elements[0]!, { y: 30, opacity: 0, blur: 4 }, undefined, options()),
      exit(elements[1]!, { y: -30, opacity: 0 }, options()),
      exit(elements[2]!, { opacity: 0 }, options({ remove: false })),
    ];
    expect(scheduler.active).toBe(true);
    flushAll(fake);
    await Promise.all(calls.map((call) => call.finished));
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
  });
});

describe("types", () => {
  test("enter() does not accept `from` in its options, which would clash with the required argument", () => {
    const element = document.createElement("div");
    const options = { scheduler: setup().scheduler };
    // @ts-expect-error `from` is not part of the options of enter().
    expect(() => enter(element, { x: 1 }, {}, { ...options, from: { x: 2 } })).not.toThrow();
  });

  test("enter() and exit() accept both spring option forms", () => {
    const { scheduler } = setup();
    const element = document.createElement("div");
    expect(() => enter(element, { x: 1 }, {}, { scheduler, stiffness: 120, damping: 14 })).not.toThrow();
    expect(() => exit(element, { x: 1 }, { scheduler, duration: 0.3, bounce: 0.2, remove: false })).not.toThrow();
  });
});
