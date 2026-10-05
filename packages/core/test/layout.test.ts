import { afterEach, describe, expect, test } from "bun:test";
import { layout, measureLayout, snapshot, type Box, type LayoutOptions } from "../src/layout";
import { animate } from "../src/animate";
import { createSpring } from "../src/spring";
import {
  A,
  B,
  C,
  IDENTITY,
  LENGTH,
  RATIO,
  centerX,
  centerY,
  createElement,
  createWorld,
  flushAll,
  parseTransform,
  restoreMatchMedia,
  setup,
  stubMatchMedia,
  trackWrites,
  transform,
} from "./layout-world";

afterEach(restoreMatchMedia);

describe("measureLayout", () => {
  test("returns the natural box regardless of the inline transform and restores the transform byte for byte", () => {
    const world = createWorld();
    const element = createElement();
    world.place(element, { a: B });
    const inline = "translate3d(12.5px, -40px, 0) rotate(0deg) scale(2, 0.5)";
    element.style.transform = inline;

    expect(world.visual(element)).not.toEqual(B);
    world.seen.length = 0;
    expect(measureLayout(element)).toEqual(B);
    expect(world.seen).toEqual([""]);
    expect(element.style.transform).toBe(inline);
  });

  test("an element without an inline transform is measured without any style write", () => {
    const world = createWorld();
    const element = createElement();
    world.place(element, { a: A });
    const writes = trackWrites(element);
    expect(measureLayout(element)).toEqual(A);
    expect(writes.log).toEqual([]);
  });

  test("an identity transform is not cleared, because it cannot change the box", () => {
    const world = createWorld();
    const element = createElement();
    world.place(element, { a: A });
    element.style.transform = IDENTITY;
    const writes = trackWrites(element);
    expect(measureLayout(element)).toEqual(A);
    expect(writes.log).toEqual([]);
  });

  test("uses viewport coordinates from getBoundingClientRect", () => {
    const element = createElement();
    element.getBoundingClientRect = () => ({ left: 7, top: 9, width: 30, height: 40, x: 0, y: 0 }) as DOMRect;
    expect(measureLayout(element)).toEqual({ x: 7, y: 9, width: 30, height: 40 });
  });
});

describe("layout", () => {
  test("the first write frame shows the element at its previous box with the exact transform", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });

    layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    const scaleX = A.width / B.width;
    const scaleY = A.height / B.height;
    fake.flush(0);
    expect(element.style.transform).toBe(transform(centerX(A) - centerX(B), centerY(A) - centerY(B), scaleX, scaleY));
    expect(element.style.transform).toBe(transform(-300, -150, scaleX, 0.5));

    const visual = world.visual(element);
    expect(visual.x).toBeCloseTo(A.x, 9);
    expect(visual.y).toBeCloseTo(A.y, 9);
    expect(visual.width).toBeCloseTo(A.width, 9);
    expect(visual.height).toBeCloseTo(A.height, 9);
  });

  test("settles to the identity transform and the scheduler goes idle", async () => {
    const world = createWorld();
    const { fake, scheduler, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });

    const controls = layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    fake.flush(16);
    expect(element.style.transform).not.toBe(IDENTITY);
    flushAll(fake, 32);
    expect(element.style.transform).toBe(IDENTITY);
    await controls.finished;
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
  });

  test("the animation follows the spring from the previous box toward the identity", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    fake.flush(80);
    const t = 0.08;
    expect(element.style.transform).toBe(
      transform(
        createSpring(-300, 0, 0, LENGTH).at(t).position,
        createSpring(-150, 0, 0, LENGTH).at(t).position,
        createSpring(A.width / B.width, 1, 0, RATIO).at(t).position,
        createSpring(0.5, 1, 0, RATIO).at(t).position,
      ),
    );
  });

  test("writes the transform once per element per frame", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const writes = trackWrites(element);
    layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    for (let frame = 0; frame < 10; frame++) {
      const before = writes.values("transform").length;
      fake.flush(frame * 16);
      expect(writes.values("transform").length - before).toBe(1);
    }
  });

  test("a zero-size natural box keeps that axis at scale 1", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    const flat: Box = { x: 200, y: 100, width: 0, height: 200 };
    world.place(element, { a: A, b: flat });
    layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    expect(element.style.transform).toBe(transform(centerX(A) - centerX(flat), centerY(A) - centerY(flat), 1, 0.5));
  });

  test("the transform-origin is pinned to the center during the animation and restored at rest", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    element.style.transformOrigin = "10% 20%";
    layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    expect(element.style.transformOrigin).toBe("50% 50%");
    flushAll(fake, 16);
    expect(element.style.transformOrigin).toBe("10% 20%");
  });

  test("a mutate() that throws propagates and starts nothing", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const failure = new Error("mutate failed");
    expect(() =>
      layout(
        element,
        () => {
          throw failure;
        },
        options(),
      ),
    ).toThrow(failure);
    expect(fake.requests).toBe(0);
    expect(element.style.transform).toBe("");
  });

  test("stop() freezes the animation and finished resolves", async () => {
    const world = createWorld();
    const { fake, scheduler, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const controls = layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    fake.flush(48);
    const frozen = element.style.transform;
    controls.stop();
    await controls.finished;
    flushAll(fake, 64);
    expect(element.style.transform).toBe(frozen);
    expect(frozen).not.toBe(IDENTITY);
    expect(scheduler.active).toBe(false);
  });
});

describe("no-op layouts", () => {
  test("an unchanged box writes nothing, requests no frame and resolves finished", async () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A });
    const writes = trackWrites(element);
    const controls = layout(element, () => {}, options());
    await controls.finished;
    expect(writes.log).toEqual([]);
    expect(fake.requests).toBe(0);
    expect(element.style.transform).toBe("");
  });

  test("a layout that does not move the element after a completed layout also writes nothing", async () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const first = layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    flushAll(fake);
    await first.finished;
    const requests = fake.requests;
    const writes = trackWrites(element);
    await layout(element, () => {}, options()).finished;
    expect(writes.log).toEqual([]);
    expect(fake.requests).toBe(requests);
  });

  test("a sub-pixel difference below 0.01 px is treated as unchanged", async () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: { ...A, x: A.x + 0.004 } });
    await layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    ).finished;
    expect(fake.requests).toBe(0);
    expect(element.style.transform).toBe("");
  });

  test("a frozen element whose new natural box equals its visual box is still rewritten, not left stale", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    const boxes: Record<string, Box> = { a: A, b: B };
    world.place(element, boxes);
    const first = layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    fake.flush(48);
    first.stop();
    const frozen = world.visual(element);
    expect(element.style.transform).not.toBe(IDENTITY);

    // The element is moved exactly to where it visually sits, so the deltas are zero but the old transform is stale.
    boxes.f = frozen;
    layout(
      element,
      () => {
        world.state = "f";
      },
      options(),
    );
    fake.flush(64);
    const visual = world.visual(element);
    expect(visual.x).toBeCloseTo(frozen.x, 9);
    expect(visual.y).toBeCloseTo(frozen.y, 9);
    expect(visual.width).toBeCloseTo(frozen.width, 9);
    expect(visual.height).toBeCloseTo(frozen.height, 9);
    expect(element.style.transform).toBe(IDENTITY);
  });
});

describe("snapshot", () => {
  test("records the visual box before the DOM change and animates afterwards", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const taken = snapshot(element);
    world.state = "b";
    taken.animate(options());
    fake.flush(0);
    expect(element.style.transform).toBe(transform(-300, -150, A.width / B.width, 0.5));
  });

  test("accepts a list of elements", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const first = createElement();
    const second = createElement();
    world.place(first, { a: A, b: B });
    world.place(second, { a: B, b: A });
    const taken = snapshot([first, second]);
    world.state = "b";
    taken.animate(options());
    fake.flush(0);
    expect(first.style.transform).toBe(transform(-300, -150, A.width / B.width, 0.5));
    expect(second.style.transform).toBe(transform(300, 150, B.width / A.width, 2));
  });
});

describe("interruption", () => {
  // Two identical elements flown from A to B for six frames; the second one is stopped, which resets its velocity.
  function interrupted() {
    const world = createWorld();
    const context = setup();
    const inherited = createElement();
    const control = createElement();
    for (const element of [inherited, control]) world.place(element, { a: A, b: B, c: C });
    const first = [snapshot(inherited), snapshot(control)];
    world.state = "b";
    first[0]!.animate(context.options());
    const controlRun = first[1]!.animate(context.options());
    for (let frame = 0; frame < 6; frame++) context.fake.flush(frame * 16);
    controlRun.stop();

    const visualBefore = world.visual(inherited);
    const second = [snapshot(inherited), snapshot(control)];
    world.state = "c";
    second[0]!.animate(context.options());
    second[1]!.animate(context.options());
    return { ...context, world, inherited, control, visualBefore };
  }

  test("the first rendered frame starts from the previous visual box, without a jump", () => {
    const { fake, world, inherited, visualBefore } = interrupted();
    // Frame 6 was the last write; the next frame is 16 ms later.
    fake.flush(96);
    const visual = world.visual(inherited);
    const velocityX = createSpring(-300, 0, 0, LENGTH).at(0.08).velocity;
    const moved = Math.abs(centerX(visual) - centerX(visualBefore));
    // One frame of travel at the inherited speed, nowhere near the distance to the new layout.
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(Math.abs(velocityX) * 0.016 * 2);
    const toNewLayout = Math.hypot(centerX(visualBefore) - centerX(C), centerY(visualBefore) - centerY(C));
    expect(toNewLayout).toBeGreaterThan(50);
    expect(moved).toBeLessThan(toNewLayout / 2);
  });

  test("translation velocity is preserved while the control that lost its velocity barely moves", () => {
    const { fake, inherited, control, visualBefore } = interrupted();
    const x0 = centerX(visualBefore) - centerX(C);
    const y0 = centerY(visualBefore) - centerY(C);
    const velocityX = createSpring(-300, 0, 0, LENGTH).at(0.08).velocity;
    const velocityY = createSpring(-150, 0, 0, LENGTH).at(0.08).velocity;
    fake.flush(96);

    const expectedX = createSpring(x0, 0, velocityX, LENGTH).at(0.016).position;
    const expectedY = createSpring(y0, 0, velocityY, LENGTH).at(0.016).position;
    const applied = parseTransform(inherited.style.transform);
    expect(applied.x).toBeCloseTo(expectedX, 9);
    expect(applied.y).toBeCloseTo(expectedY, 9);

    const inheritedStep = Math.abs(applied.x - x0);
    const controlStep = Math.abs(parseTransform(control.style.transform).x - x0);
    expect(inheritedStep).toBeGreaterThan(1);
    expect(controlStep).toBeLessThan(inheritedStep / 3);
  });

  test("scale velocity is rescaled to the new reference size", () => {
    const { fake, inherited, control, visualBefore } = interrupted();
    const elapsed = 0.08;
    const scaleXBefore = createSpring(A.width / B.width, 1, 0, RATIO).at(elapsed);
    const scaleYBefore = createSpring(0.5, 1, 0, RATIO).at(elapsed);
    const newScaleX = (B.width * scaleXBefore.position) / C.width;
    const newScaleY = (B.height * scaleYBefore.position) / C.height;
    expect(visualBefore.width).toBeCloseTo(B.width * scaleXBefore.position, 9);
    fake.flush(96);

    const rescaledX = (scaleXBefore.velocity * B.width) / C.width;
    const rescaledY = (scaleYBefore.velocity * B.height) / C.height;
    const expectedX = createSpring(newScaleX, 1, rescaledX, RATIO).at(0.016).position;
    const expectedY = createSpring(newScaleY, 1, rescaledY, RATIO).at(0.016).position;
    const applied = parseTransform(inherited.style.transform);
    expect(applied.scaleX).toBeCloseTo(expectedX, 9);
    expect(applied.scaleY).toBeCloseTo(expectedY, 9);

    // Keeping the unscaled velocity (or resetting it) would give a measurably different frame.
    const unscaled = createSpring(newScaleX, 1, scaleXBefore.velocity, RATIO).at(0.016).position;
    expect(Math.abs(applied.scaleX - unscaled)).toBeGreaterThan(1e-4);
    const controlScaleX = parseTransform(control.style.transform).scaleX;
    expect(Math.abs(controlScaleX - newScaleX)).toBeLessThan(Math.abs(applied.scaleX - newScaleX) / 2);
  });

  test("an interrupted layout still settles at the identity and resolves the superseded finished", async () => {
    const world = createWorld();
    const { fake, scheduler, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B, c: C });
    const first = layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    for (let frame = 0; frame < 6; frame++) fake.flush(frame * 16);
    const second = layout(
      element,
      () => {
        world.state = "c";
      },
      options(),
    );
    flushAll(fake, 96);
    await first.finished;
    await second.finished;
    expect(element.style.transform).toBe(IDENTITY);
    expect(scheduler.active).toBe(false);
  });
});

describe("scale correction", () => {
  function parentWithChildren(count = 2) {
    const parent = createElement();
    const children = Array.from({ length: count }, () => createElement(parent));
    return { parent, children };
  }

  test("each corrected child gets the inverse scale and a top-left origin in the same write job as the parent", () => {
    const world = createWorld();
    const context = setup();
    const { parent, children } = parentWithChildren();
    world.place(parent, { a: A, b: B });
    const parentWrites = trackWrites(parent);
    const childWrites = children.map(trackWrites);

    layout(
      parent,
      () => {
        world.state = "b";
      },
      context.options({ correct: "children" }),
    );
    const scaleX = A.width / B.width;
    const scaleY = A.height / B.height;
    context.fake.flush(0);
    for (const child of children) {
      expect(child.style.transform).toBe(`scale(${1 / scaleX}, ${1 / scaleY})`);
      expect(child.style.transformOrigin).toBe("0 0");
    }

    for (let frame = 1; frame < 10; frame++) {
      const jobs = context.writeJobs;
      const before = [parentWrites, ...childWrites].map((writes) => writes.values("transform").length);
      context.fake.flush(frame * 16);
      expect(context.writeJobs - jobs).toBe(1);
      const after = [parentWrites, ...childWrites].map((writes) => writes.values("transform").length);
      expect(after.map((count, index) => count - before[index]!)).toEqual([1, 1, 1]);
    }
  });

  test("the child scale tracks the parent scale on every frame", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const { parent, children } = parentWithChildren(1);
    world.place(parent, { a: A, b: B });
    layout(
      parent,
      () => {
        world.state = "b";
      },
      options({ correct: "children" }),
    );
    for (let frame = 0; frame < 8; frame++) {
      fake.flush(frame * 16);
      const applied = parseTransform(parent.style.transform);
      expect(children[0]!.style.transform).toBe(`scale(${1 / applied.scaleX}, ${1 / applied.scaleY})`);
    }
  });

  test("after stop() the frozen parent keeps its child correction and radius on later transform writes", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const { parent, children } = parentWithChildren(1);
    world.place(parent, { a: A, b: B });
    const controls = layout(
      parent,
      () => {
        world.state = "b";
      },
      options({ correct: "children", radius: 12 }),
    );
    for (let frame = 0; frame < 4; frame++) fake.flush(frame * 16);
    controls.stop();

    // Any later transform write on the frozen element must not treat it as finished.
    animate(parent, { rotate: 1 }, options());
    fake.flush(64);
    const applied = parseTransform(parent.style.transform);
    expect(applied.scaleX).not.toBe(1);
    expect(children[0]!.style.transform).toBe(`scale(${1 / applied.scaleX}, ${1 / applied.scaleY})`);
    expect(children[0]!.style.transformOrigin).toBe("0 0");
    expect(parent.style.borderRadius).not.toBe("12px");
  });

  test("at rest the child transform is cleared and the origins are restored", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const { parent, children } = parentWithChildren();
    world.place(parent, { a: A, b: B });
    const writes = children.map(trackWrites);
    layout(
      parent,
      () => {
        world.state = "b";
      },
      options({ correct: "children" }),
    );
    flushAll(fake);
    for (const [index, child] of children.entries()) {
      expect(child.style.transform).toBe("");
      expect(child.style.transformOrigin).toBe("");
      expect(writes[index]!.values("transform").at(-1)).toBe("");
    }
    expect(parent.style.transformOrigin).toBe("");

    // Nothing keeps writing once the layout is at rest.
    const settledWrites = writes.map((entry) => entry.log.length);
    fake.flush(100_000);
    expect(writes.map((entry) => entry.log.length)).toEqual(settledWrites);
  });

  test('"children" means the direct element children present when animate() is called', () => {
    const world = createWorld();
    const { fake, options } = setup();
    const { parent, children } = parentWithChildren(1);
    const grandchild = createElement(children[0]!);
    world.place(parent, { a: A, b: B });
    const taken = snapshot(parent);
    const early = createElement(parent);
    world.state = "b";
    taken.animate(options({ correct: "children" }));
    const late = createElement(parent);
    fake.flush(0);

    expect(children[0]!.style.transform).not.toBe("");
    expect(early.style.transform).not.toBe("");
    expect(late.style.transform).toBe("");
    expect(grandchild.style.transform).toBe("");
  });

  test("an explicit list corrects only those elements", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const { parent, children } = parentWithChildren(2);
    world.place(parent, { a: A, b: B });
    layout(
      parent,
      () => {
        world.state = "b";
      },
      options({ correct: [children[1]!] }),
    );
    fake.flush(0);
    expect(children[0]!.style.transform).toBe("");
    expect(children[1]!.style.transform).not.toBe("");
  });

  test("without correct the children are left alone", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const { parent, children } = parentWithChildren(1);
    world.place(parent, { a: A, b: B });
    layout(
      parent,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    expect(children[0]!.style.transform).toBe("");
    expect(children[0]!.style.transformOrigin).toBe("");
  });
});

describe("radius correction", () => {
  test("keeps the radius visually constant while scaling and restores it at rest", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const writes = trackWrites(element);
    layout(
      element,
      () => {
        world.state = "b";
      },
      options({ radius: 8 }),
    );
    const scaleX = A.width / B.width;
    fake.flush(0);
    expect(writes.values("borderRadius")).toEqual([`${8 / scaleX}px / ${8 / 0.5}px`]);

    fake.flush(80);
    const applied = parseTransform(element.style.transform);
    expect(writes.values("borderRadius").at(-1)).toBe(`${8 / applied.scaleX}px / ${8 / applied.scaleY}px`);

    flushAll(fake, 96);
    expect(writes.values("borderRadius").at(-1)).toBe("8px");
    const frames = writes.values("borderRadius").length;
    expect(frames).toBe(writes.values("transform").length);
  });

  test("is not written when no radius is requested", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const writes = trackWrites(element);
    layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    flushAll(fake);
    expect(writes.values("borderRadius")).toEqual([]);
  });
});

describe("reduced motion", () => {
  test('"always" jumps to the identity on the first frame and resolves finished', async () => {
    const world = createWorld();
    const { fake, scheduler, options } = setup();
    const { parent, children } = { parent: createElement(), children: [] as HTMLElement[] };
    children.push(createElement(parent));
    world.place(parent, { a: A, b: B });
    const writes = trackWrites(parent);
    const controls = layout(
      parent,
      () => {
        world.state = "b";
      },
      options({ reducedMotion: "always", correct: "children", radius: 8 }),
    );
    fake.flush(0);
    expect(parent.style.transform).toBe(IDENTITY);
    expect(children[0]!.style.transform).toBe("");
    expect(writes.values("borderRadius").at(-1)).toBe("8px");
    expect(fake.pending).toBe(0);
    expect(scheduler.active).toBe(false);
    await controls.finished;
  });

  test('"user" follows prefers-reduced-motion', async () => {
    stubMatchMedia(true);
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const controls = layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    expect(element.style.transform).toBe(IDENTITY);
    expect(fake.pending).toBe(0);
    await controls.finished;
  });

  test("animates normally when reduced motion is not requested", () => {
    stubMatchMedia(false);
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    layout(
      element,
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    expect(element.style.transform).not.toBe(IDENTITY);
    expect(fake.pending).toBe(1);
  });
});

describe("multiple targets", () => {
  test("each element gets its own deltas and finished waits for all of them", async () => {
    const world = createWorld();
    const { fake, options } = setup();
    const far = createElement();
    const near = createElement();
    const nearFrom: Box = { x: 10, y: 10, width: 50, height: 50 };
    const nearTo: Box = { x: 10.5, y: 10, width: 50, height: 50 };
    world.place(far, { a: A, b: B });
    world.place(near, { a: nearFrom, b: nearTo });

    const controls = layout(
      [far, near],
      () => {
        world.state = "b";
      },
      options(),
    );
    let finished = false;
    void controls.finished.then(() => {
      finished = true;
    });
    fake.flush(0);
    expect(far.style.transform).toBe(transform(-300, -150, A.width / B.width, 0.5));
    expect(near.style.transform).toBe(transform(-0.5, 0, 1, 1));

    let timestamp = 16;
    while (near.style.transform !== IDENTITY) {
      fake.flush(timestamp);
      timestamp += 16;
    }
    await Promise.resolve();
    expect(far.style.transform).not.toBe(IDENTITY);
    expect(finished).toBe(false);

    flushAll(fake, timestamp);
    await controls.finished;
    expect(finished).toBe(true);
    expect(far.style.transform).toBe(IDENTITY);
  });

  test("stop() freezes every element", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const first = createElement();
    const second = createElement();
    world.place(first, { a: A, b: B });
    world.place(second, { a: A, b: B });
    const controls = layout(
      [first, second],
      () => {
        world.state = "b";
      },
      options(),
    );
    fake.flush(0);
    fake.flush(48);
    controls.stop();
    const frozen = [first.style.transform, second.style.transform];
    flushAll(fake, 64);
    expect([first.style.transform, second.style.transform]).toEqual(frozen);
  });
});

describe("validation", () => {
  test("invalid spring options throw before mutate() or any element is touched", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const writes = trackWrites(element);
    let mutated = false;
    const mutate = () => {
      mutated = true;
    };

    expect(() => layout(element, mutate, options({ duration: -1 }))).toThrow(RangeError);
    expect(() => layout(element, mutate, options({ restDelta: 0 }))).toThrow(RangeError);
    expect(mutated).toBe(false);
    expect(world.reads).toBe(0);
    expect(writes.log).toEqual([]);
    expect(fake.requests).toBe(0);
  });

  test("snapshot.animate() validates before measuring or writing anything", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const element = createElement();
    world.place(element, { a: A, b: B });
    const taken = snapshot(element);
    const reads = world.reads;
    const writes = trackWrites(element);
    world.state = "b";

    expect(() => taken.animate(options({ stiffness: 100, damping: -1 } as Partial<LayoutOptions>))).toThrow(RangeError);
    expect(() => taken.animate(options({ radius: -1 }))).toThrow(RangeError);
    expect(() => taken.animate(options({ radius: Number.NaN }))).toThrow(RangeError);
    expect(world.reads).toBe(reads);
    expect(writes.log).toEqual([]);
    expect(fake.requests).toBe(0);
  });
});

describe("types", () => {
  test("layout options do not accept `from`, which a layout would ignore", () => {
    // @ts-expect-error `from` is not part of LayoutOptions.
    const options: LayoutOptions = { from: { x: 1 } };
    expect(options).toBeDefined();
  });
});
