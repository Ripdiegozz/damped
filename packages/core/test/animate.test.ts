import { afterEach, describe, expect, test } from "bun:test";
import { animate, type AnimateOptions, type AnimationTargets } from "../src/animate";
import { createScheduler } from "../src/scheduler";
import { createSpring } from "../src/spring";
import { createFakeSource } from "./fake-frame-source";

const SPRING = { duration: 0.5, bounce: 0.15 } as const;
const originalMatchMedia = globalThis.matchMedia;

afterEach(() => {
  globalThis.matchMedia = originalMatchMedia;
});

function setup() {
  const fake = createFakeSource();
  const scheduler = createScheduler(fake.source);
  const options = (extra: Partial<AnimateOptions> = {}): AnimateOptions => ({ ...SPRING, scheduler, ...extra });
  return { fake, scheduler, options };
}

function flushAll(fake: ReturnType<typeof createFakeSource>, from = 0, step = 16, limit = 3000): number {
  let timestamp = from;
  for (let i = 0; i < limit && fake.pending > 0; i++) {
    fake.flush(timestamp);
    timestamp += step;
  }
  return timestamp;
}

function createElement(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

type StyleProperty = "transform" | "opacity" | "filter";

// Replaces `style` with a proxy that records every property assignment.
function trackWrites(element: HTMLElement) {
  const log: { property: string; value: string }[] = [];
  const spy = new Proxy(element.style, {
    set(target, property, value) {
      log.push({ property: String(property), value: String(value) });
      return Reflect.set(target, property, value);
    },
    get: (target, property) => Reflect.get(target, property),
  });
  Object.defineProperty(element, "style", { value: spy, configurable: true });
  return {
    log,
    count: (property: StyleProperty) => log.filter((entry) => entry.property === property).length,
  };
}

function transform(x: number, y: number, rotate: number, scaleX: number, scaleY: number): string {
  return `translate3d(${x}px, ${y}px, 0) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`;
}

function translateX(element: HTMLElement): number {
  const match = /translate3d\(([^p]+)px/.exec(element.style.transform);
  return Number(match![1]);
}

function stubMatchMedia(matches: boolean, queries: string[] = []) {
  globalThis.matchMedia = ((query: string) => {
    queries.push(query);
    return { matches } as MediaQueryList;
  }) as typeof matchMedia;
}

describe("rendering", () => {
  test("writes exact transform, opacity and filter strings during and after the animation", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 100, y: -40, rotate: 90, scale: 2, opacity: 0.25, blur: 8 }, options());

    const expected = (t: number) => {
      const at = (from: number, to: number, delta: number, speed: number) =>
        createSpring(from, to, 0, { ...SPRING, restDelta: delta, restSpeed: speed }).at(t).position;
      return {
        x: at(0, 100, 0.01, 0.1),
        y: at(0, -40, 0.01, 0.1),
        rotate: at(0, 90, 0.01, 0.1),
        scale: at(1, 2, 0.0005, 0.005),
        opacity: at(1, 0.25, 0.0005, 0.005),
        blur: at(0, 8, 0.01, 0.1),
      };
    };

    fake.flush(0);
    expect(element.style.transform).toBe(transform(0, 0, 0, 1, 1));
    expect(element.style.opacity).toBe("1");
    expect(element.style.filter).toBe("");

    fake.flush(80);
    const mid = expected(0.08);
    expect(element.style.transform).toBe(transform(mid.x, mid.y, mid.rotate, mid.scale, mid.scale));
    expect(element.style.opacity).toBe(String(mid.opacity));
    expect(element.style.filter).toBe(`blur(${mid.blur}px)`);

    flushAll(fake, 96);
    expect(element.style.transform).toBe(transform(100, -40, 90, 2, 2));
    expect(element.style.opacity).toBe("0.25");
    expect(element.style.filter).toBe("blur(8px)");
  });

  test("scale and scaleX/scaleY multiply per axis", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { scale: 2, scaleX: 0.5, scaleY: 3 }, options());
    flushAll(fake);
    expect(element.style.transform).toBe(transform(0, 0, 0, 1, 6));
  });

  test("blur at or below 0.01 clears the filter", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { blur: 4 }, options());
    flushAll(fake);
    expect(element.style.filter).toBe("blur(4px)");
    animate(element, { blur: 0 }, options());
    flushAll(fake, 10_000);
    expect(element.style.filter).toBe("");
  });

  test("only the properties that were animated are written", () => {
    const { fake, options } = setup();
    const element = createElement();
    const writes = trackWrites(element);
    animate(element, { opacity: 0 }, options());
    flushAll(fake);
    expect(writes.count("opacity")).toBeGreaterThan(0);
    expect(writes.count("transform")).toBe(0);
    expect(writes.count("filter")).toBe(0);
    expect(element.style.opacity).toBe("0");
  });

  test("writes each property group at most once per element per frame", () => {
    const { fake, options } = setup();
    const element = createElement();
    const writes = trackWrites(element);
    animate(element, { x: 100, y: 50, rotate: 30, scale: 2, scaleX: 1.5, opacity: 0, blur: 5 }, options());
    for (let frame = 0; frame < 12; frame++) {
      const before = writes.log.length;
      fake.flush(frame * 16);
      const frameWrites = writes.log.slice(before).map((entry) => entry.property);
      expect([...frameWrites].sort()).toEqual(["filter", "opacity", "transform"]);
    }
  });

  test("writes only the groups that changed in a frame", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 100 }, options());
    animate(element, { opacity: 0.5 }, options({ duration: 0.05 }));
    const writes = trackWrites(element);
    flushAll(fake);
    expect(writes.count("transform")).toBeGreaterThan(writes.count("opacity"));
  });

  test("initial values come from the identity transform and the computed opacity", () => {
    const { fake, options } = setup();
    const element = createElement();
    element.style.opacity = "0.4";
    animate(element, { opacity: 0.8, scale: 2 }, options());
    fake.flush(0);
    expect(element.style.opacity).toBe("0.4");
    expect(element.style.transform).toBe(transform(0, 0, 0, 1, 1));
  });

  test("falls back to opacity 1 when the computed opacity is not a finite number", () => {
    const { fake, options } = setup();
    const element = createElement();
    const original = globalThis.getComputedStyle;
    globalThis.getComputedStyle = (() => ({ opacity: "auto" })) as unknown as typeof getComputedStyle;
    try {
      animate(element, { opacity: 0 }, options());
    } finally {
      globalThis.getComputedStyle = original;
    }
    fake.flush(0);
    expect(element.style.opacity).toBe("1");
  });
});

describe("rest thresholds", () => {
  // Frames needed with 16 ms steps: the first frame is t = 0, so a spring settling at frame n takes n + 1 flushes.
  const expectedFlushes = (from: number, to: number, restDelta: number, restSpeed: number) => {
    const spring = createSpring(from, to, 0, { ...SPRING, restDelta, restSpeed });
    let frame = 0;
    while (!spring.isSettled(frame * 0.016)) frame++;
    return frame + 1;
  };

  const flushesFor = (props: AnimationTargets, extra: Partial<AnimateOptions> = {}) => {
    const { fake, options } = setup();
    animate(createElement(), props, options(extra));
    let flushes = 0;
    while (fake.pending > 0) fake.flush(flushes++ * 16);
    return flushes;
  };

  test("x, y, rotate and blur settle at delta 0.01 and speed 0.1", () => {
    const expected = expectedFlushes(0, 1, 0.01, 0.1);
    for (const property of ["x", "y", "rotate", "blur"] as const) {
      expect(flushesFor({ [property]: 1 })).toBe(expected);
    }
  });

  test("scale, scaleX, scaleY and opacity settle at delta 0.0005 and speed 0.005", () => {
    for (const property of ["scale", "scaleX", "scaleY"] as const) {
      expect(flushesFor({ [property]: 2 })).toBe(expectedFlushes(1, 2, 0.0005, 0.005));
    }
    expect(flushesFor({ opacity: 0 }, {})).toBe(expectedFlushes(1, 0, 0.0005, 0.005));
  });

  test("the finer table is strictly slower, so the two tables are distinguishable", () => {
    expect(expectedFlushes(0, 1, 0.0005, 0.005)).toBeGreaterThan(expectedFlushes(0, 1, 0.01, 0.1));
  });

  test("user restDelta and restSpeed override the per-property defaults", () => {
    expect(flushesFor({ x: 1 }, { restDelta: 0.0005, restSpeed: 0.005 })).toBe(expectedFlushes(0, 1, 0.0005, 0.005));
    expect(flushesFor({ scale: 2 }, { restDelta: 0.01, restSpeed: 0.1 })).toBe(expectedFlushes(1, 2, 0.01, 0.1));
  });

  test("a partial override keeps the other default", () => {
    expect(flushesFor({ x: 1 }, { restDelta: 0.0005 })).toBe(expectedFlushes(0, 1, 0.0005, 0.1));
  });
});

describe("interruption", () => {
  test("a second animate() continues with the inherited velocity", () => {
    const { fake, options } = setup();
    const a = createElement();
    const b = createElement();
    for (const element of [a, b]) animate(element, { x: 100 }, options());
    let timestamp = 0;
    for (let i = 0; i < 6; i++, timestamp += 16) fake.flush(timestamp);
    const last = timestamp - 16;
    const before = translateX(a);
    expect(translateX(b)).toBe(before);

    animate(a, { x: 0 }, options());
    const controls = animate(b, { x: 0 }, options());
    // Control: velocity reset by freezing before the retarget.
    controls.stop();
    animate(b, { x: 0 }, options());

    fake.flush(last + 16);
    const inheritedStep = translateX(a) - before;
    const controlStep = translateX(b) - before;
    expect(inheritedStep).toBeGreaterThan(1);
    expect(Math.abs(controlStep)).toBeLessThan(inheritedStep / 3);

    fake.flush(last + 32);
    expect(translateX(a) - before).toBeGreaterThan(2 * (translateX(b) - before) + 1);
  });

  test("retargeting reuses the same value instead of restarting from the identity", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 100 }, options());
    flushAll(fake);
    expect(translateX(element)).toBe(100);
    animate(element, { x: 100, y: 10 }, options());
    fake.flush(50_000);
    expect(element.style.transform).toBe(transform(100, 0, 0, 1, 1));
  });
});

describe("reduced motion", () => {
  test("jumps the spatial properties and still animates opacity and blur when the user prefers reduced motion", () => {
    const queries: string[] = [];
    stubMatchMedia(true, queries);
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 50, y: 20, scale: 2, scaleX: 1.5, scaleY: 0.5, rotate: 45, opacity: 0.2, blur: 6 }, options());
    expect(queries).toEqual(["(prefers-reduced-motion: reduce)"]);
    fake.flush(0);
    expect(element.style.transform).toBe(transform(50, 20, 45, 3, 1));
    expect(element.style.opacity).toBe("1");
    expect(element.style.filter).toBe("");

    fake.flush(16);
    const opacity = Number(element.style.opacity);
    expect(opacity).toBeLessThan(1);
    expect(opacity).toBeGreaterThan(0.2);
    expect(element.style.filter).toMatch(/^blur\(/);
    expect(element.style.transform).toBe(transform(50, 20, 45, 3, 1));

    flushAll(fake, 32);
    expect(element.style.opacity).toBe("0.2");
    expect(element.style.filter).toBe("blur(6px)");
  });

  test('"always" jumps without consulting matchMedia', () => {
    const queries: string[] = [];
    stubMatchMedia(false, queries);
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 30 }, options({ reducedMotion: "always" }));
    fake.flush(0);
    expect(element.style.transform).toBe(transform(30, 0, 0, 1, 1));
    expect(queries).toEqual([]);
  });

  test('"never" animates even when the user prefers reduced motion', () => {
    const queries: string[] = [];
    stubMatchMedia(true, queries);
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 30 }, options({ reducedMotion: "never" }));
    fake.flush(0);
    expect(element.style.transform).toBe(transform(0, 0, 0, 1, 1));
    expect(queries).toEqual([]);
    fake.flush(16);
    expect(translateX(element)).toBeGreaterThan(0);
    expect(translateX(element)).toBeLessThan(30);
  });

  test("animates normally when the user has no reduced-motion preference", () => {
    stubMatchMedia(false);
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 30 }, options());
    fake.flush(0);
    fake.flush(16);
    expect(translateX(element)).toBeGreaterThan(0);
    expect(translateX(element)).toBeLessThan(30);
  });

  test("treats a missing matchMedia as no preference", () => {
    // @ts-expect-error simulating an environment without matchMedia
    globalThis.matchMedia = undefined;
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 30 }, options());
    fake.flush(0);
    fake.flush(16);
    expect(translateX(element)).toBeLessThan(30);
  });

  test("a reduced-motion jump interrupts a running animation and resolves it", async () => {
    stubMatchMedia(false);
    const { fake, scheduler, options } = setup();
    const element = createElement();
    const first = animate(element, { x: 100 }, options());
    fake.flush(0);
    fake.flush(16);
    const second = animate(element, { x: 10 }, options({ reducedMotion: "always" }));
    fake.flush(32);
    expect(element.style.transform).toBe(transform(10, 0, 0, 1, 1));
    await first.finished;
    await second.finished;
    expect(fake.pending).toBe(0);
    expect(scheduler.active).toBe(false);
  });
});

describe("finished and stop", () => {
  test("finished resolves once every property has settled, then the scheduler is idle", async () => {
    const { fake, scheduler, options } = setup();
    const element = createElement();
    let done = false;
    const controls = animate(element, { x: 100, opacity: 0, scale: 3 }, options());
    void controls.finished.then(() => (done = true));
    fake.flush(0);
    await Promise.resolve();
    expect(done).toBe(false);
    flushAll(fake, 16);
    await controls.finished;
    expect(done).toBe(true);
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
  });

  test("finished resolves, not rejects, when the properties are superseded", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const first = animate(element, { x: 100 }, options());
    fake.flush(0);
    fake.flush(16);
    animate(element, { x: -100 }, options());
    await expect(first.finished).resolves.toBeUndefined();
    flushAll(fake, 32);
  });

  test("finished resolves immediately when there is nothing to animate", async () => {
    const { fake, options } = setup();
    await expect(animate(createElement(), {}, options()).finished).resolves.toBeUndefined();
    await expect(animate([], { x: 1 }, options()).finished).resolves.toBeUndefined();
    expect(fake.requests).toBe(0);
  });

  test("stop() freezes the animation where it is and resolves finished", async () => {
    const { fake, scheduler, options } = setup();
    const element = createElement();
    const controls = animate(element, { x: 100, opacity: 0 }, options());
    fake.flush(0);
    fake.flush(48);
    const frozen = element.style.transform;
    const frozenOpacity = element.style.opacity;
    controls.stop();
    await controls.finished;
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
    expect(element.style.transform).toBe(frozen);
    expect(element.style.opacity).toBe(frozenOpacity);
    expect(translateX(element)).toBeGreaterThan(0);
    expect(translateX(element)).toBeLessThan(100);
  });

  test("stop() of an older call leaves properties taken over by a newer call alone", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const older = animate(element, { x: 100, y: 100 }, options());
    fake.flush(0);
    fake.flush(32);
    const newer = animate(element, { x: 0 }, options());
    older.stop();
    fake.flush(48);
    const afterOne = element.style.transform;
    flushAll(fake, 64);
    await newer.finished;
    const frozenY = /translate3d\([^,]+, ([^p]+)px/.exec(element.style.transform)![1];
    expect(Number(frozenY)).toBeGreaterThan(0);
    expect(Number(frozenY)).toBeLessThan(100);
    expect(translateX(element)).toBe(0);
    expect(afterOne).not.toBe(element.style.transform);
    // y stayed where the older call froze it, so no further frame moved it.
    const yAtFreeze = Number(/translate3d\([^,]+, ([^p]+)px/.exec(afterOne)![1]);
    expect(Number(frozenY)).toBe(yAtFreeze);
  });

  test("stop() after everything settled changes nothing", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const controls = animate(element, { x: 20 }, options());
    flushAll(fake);
    controls.stop();
    await controls.finished;
    expect(translateX(element)).toBe(20);
    expect(fake.pending).toBe(0);
  });
});

describe("from", () => {
  test("is applied immediately as a jump before animating", async () => {
    const { fake, options } = setup();
    const element = createElement();
    const controls = animate(element, { x: 100 }, options({ from: { x: 40, opacity: 0 } }));
    fake.flush(0);
    expect(element.style.transform).toBe(transform(40, 0, 0, 1, 1));
    expect(element.style.opacity).toBe("0");
    fake.flush(16);
    const expected = createSpring(40, 100, 0, { ...SPRING, restDelta: 0.01, restSpeed: 0.1 }).at(0.016).position;
    expect(translateX(element)).toBe(expected);
    flushAll(fake, 32);
    await controls.finished;
    expect(element.style.transform).toBe(transform(100, 0, 0, 1, 1));
    expect(element.style.opacity).toBe("0");
  });

  test("starts the animation from rest even if the element was moving", () => {
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 100 }, options());
    fake.flush(0);
    fake.flush(48);
    animate(element, { x: 100 }, options({ from: { x: 0 } }));
    fake.flush(64);
    expect(translateX(element)).toBe(0);
  });

  test("applies under reduced motion and respects the jump", () => {
    stubMatchMedia(true);
    const { fake, options } = setup();
    const element = createElement();
    animate(element, { x: 100 }, options({ from: { x: 40 } }));
    fake.flush(0);
    expect(translateX(element)).toBe(100);
  });
});

describe("multiple elements", () => {
  test("applies the targets to every element and finished waits for all of them", async () => {
    const { fake, scheduler, options } = setup();
    const first = createElement();
    const second = createElement();
    const controls = animate([first, second], { x: 60 }, options());
    let done = false;
    void controls.finished.then(() => (done = true));
    fake.flush(0);
    fake.flush(16);
    expect(translateX(first)).toBe(translateX(second));
    expect(translateX(first)).toBeGreaterThan(0);
    expect(done).toBe(false);
    flushAll(fake, 32);
    await controls.finished;
    expect(translateX(first)).toBe(60);
    expect(translateX(second)).toBe(60);
    expect(scheduler.active).toBe(false);
  });

  test("stop() freezes every element in the call", () => {
    const { fake, options } = setup();
    const first = createElement();
    const second = createElement();
    const controls = animate([first, second], { x: 60 }, options());
    fake.flush(0);
    fake.flush(32);
    controls.stop();
    expect(fake.pending).toBe(0);
    expect(translateX(first)).toBeLessThan(60);
    expect(translateX(second)).toBeLessThan(60);
  });

  test("elements keep independent state", () => {
    const { fake, options } = setup();
    const first = createElement();
    const second = createElement();
    animate(first, { x: 100 }, options());
    fake.flush(0);
    fake.flush(48);
    animate(second, { x: 100 }, options());
    fake.flush(64);
    fake.flush(80);
    expect(translateX(first)).toBeGreaterThan(translateX(second));
  });
});

describe("validation", () => {
  test("a non-finite target throws RangeError synchronously without side effects", () => {
    const { fake, options } = setup();
    const element = createElement();
    expect(() => animate(element, { x: Number.NaN }, options())).toThrow(RangeError);
    expect(() => animate(element, { x: 1, opacity: Number.POSITIVE_INFINITY }, options())).toThrow(RangeError);
    expect(() => animate(element, { x: 1 }, options({ from: { y: Number.NaN } }))).toThrow(RangeError);
    expect(fake.requests).toBe(0);
    expect(element.style.transform).toBe("");
  });

  test("an unknown property name throws TypeError synchronously without side effects", () => {
    const { fake, options } = setup();
    const element = createElement();
    expect(() => animate(element, { x: 1, width: 10 } as never, options())).toThrow(TypeError);
    expect(() => animate(element, { constructor: 1 } as never, options())).toThrow(TypeError);
    expect(() => animate(element, { x: 1 }, options({ from: { skew: 1 } as never }))).toThrow(TypeError);
    expect(fake.requests).toBe(0);
  });
});

describe("idle", () => {
  test("the scheduler goes idle after everything settles, across elements and calls", async () => {
    stubMatchMedia(false);
    const { fake, scheduler, options } = setup();
    const elements = [createElement(), createElement(), createElement()];
    const calls = [
      animate(elements, { x: 40, scale: 1.5 }, options()),
      animate(elements[0]!, { opacity: 0.3, blur: 2 }, options()),
      animate(elements[1]!, { x: 10 }, options({ reducedMotion: "always" })),
    ];
    expect(scheduler.active).toBe(true);
    flushAll(fake);
    await Promise.all(calls.map((call) => call.finished));
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
  });
});
