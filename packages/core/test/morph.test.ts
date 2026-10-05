import { afterEach, describe, expect, test } from "bun:test";
import { animate } from "../src/animate";
import { morph, type MorphOptions } from "../src/morph";
import { createSpring } from "../src/spring";
import {
  A,
  B,
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

// Fades the way morph() derives them from the default 0.5 s spring: the incoming one is twice as fast.
const FADE_IN = { duration: 0.25, bounce: 0 } as const;
const FADE_OUT = { duration: 0.5, bounce: 0 } as const;

const blurOf = (child: HTMLElement): number => {
  const match = /^blur\((.+)px\)$/.exec(child.style.filter);
  return match === null ? 0 : Number(match[1]);
};
const opacityOf = (element: HTMLElement): number => (element.style.opacity === "" ? 1 : Number(element.style.opacity));

// A card (box A) and a modal (box B), each with content children, in one shared simulated layout.
function scene(children = 1) {
  const world = createWorld();
  const context = setup();
  const make = (box: typeof A) => {
    const element = createElement();
    world.place(element, { a: box });
    return { element, children: Array.from({ length: children }, () => createElement(element)) };
  };
  const card = make(A);
  const modal = make(B);
  const options = (extra: Partial<MorphOptions> = {}): MorphOptions => ({ ...context.options(), ...extra }) as MorphOptions;
  return { world, ...context, card: card.element, cardChildren: card.children, modal: modal.element, modalChildren: modal.children, options, make };
}

describe("validation", () => {
  test("from === to throws a TypeError before anything is measured or written", () => {
    const { world, fake, card, options } = scene();
    const writes = trackWrites(card);
    expect(() => morph(card, card, options())).toThrow(TypeError);
    expect(world.reads).toBe(0);
    expect(writes.log).toEqual([]);
    expect(fake.requests).toBe(0);
  });

  test("invalid options throw before any element is measured or touched", () => {
    const { world, fake, card, modal, cardChildren, options } = scene();
    const writes = [card, modal, ...cardChildren].map(trackWrites);
    const invalid: Partial<MorphOptions>[] = [
      { duration: -1 },
      { restDelta: 0 },
      { radius: -1 },
      { radius: Number.NaN },
      { blur: -1 },
      { blur: Number.NaN },
      { blur: Number.POSITIVE_INFINITY },
    ];
    for (const extra of invalid) expect(() => morph(card, modal, options(extra))).toThrow(RangeError);
    expect(() => morph(card, modal, options({ stiffness: 100, damping: -1 } as Partial<MorphOptions>))).toThrow(RangeError);
    expect(world.reads).toBe(0);
    expect(writes.map((entry) => entry.log)).toEqual([[], [], []]);
    expect(fake.requests).toBe(0);
  });
});

describe("geometry", () => {
  test("the target starts at the origin box and the origin is sent to the target box, with the exact transforms", () => {
    const { world, fake, card, modal, options } = scene();
    morph(card, modal, options());
    fake.flush(0);

    const scaleX = A.width / B.width;
    const scaleY = A.height / B.height;
    expect(modal.style.transform).toBe(transform(centerX(A) - centerX(B), centerY(A) - centerY(B), scaleX, scaleY));
    expect(modal.style.transform).toBe(transform(-300, -150, scaleX, 0.5));
    expect(card.style.transform).toBe(IDENTITY);

    const visual = world.visual(modal);
    expect(visual.x).toBeCloseTo(A.x, 9);
    expect(visual.width).toBeCloseTo(A.width, 9);
    expect(visual.height).toBeCloseTo(A.height, 9);

    flushAll(fake, 16);
    expect(card.style.transform).toBe(transform(300, 150, B.width / A.width, B.height / A.height));
    expect(modal.style.transform).toBe(IDENTITY);
  });

  test("both elements follow the spring between their deltas", () => {
    const { fake, card, modal, options } = scene();
    morph(card, modal, options());
    fake.flush(0);
    fake.flush(80);
    const t = 0.08;
    expect(modal.style.transform).toBe(
      transform(
        createSpring(-300, 0, 0, LENGTH).at(t).position,
        createSpring(-150, 0, 0, LENGTH).at(t).position,
        createSpring(A.width / B.width, 1, 0, RATIO).at(t).position,
        createSpring(0.5, 1, 0, RATIO).at(t).position,
      ),
    );
    expect(card.style.transform).toBe(
      transform(
        createSpring(0, 300, 0, LENGTH).at(t).position,
        createSpring(0, 150, 0, LENGTH).at(t).position,
        createSpring(1, 3, 0, RATIO).at(t).position,
        createSpring(1, 2, 0, RATIO).at(t).position,
      ),
    );
  });

  test("each element's transform is written once per frame and children share the write job", () => {
    const { fake, card, modal, cardChildren, modalChildren, options } = scene(2);
    const writes = [card, modal, ...cardChildren, ...modalChildren].map(trackWrites);
    morph(card, modal, options());
    for (let frame = 0; frame < 10; frame++) {
      const before = writes.map((entry) => entry.values("transform").length);
      fake.flush(frame * 16);
      const after = writes.map((entry) => entry.values("transform").length);
      expect(after.map((count, index) => count - before[index]!)).toEqual([1, 1, 1, 1, 1, 1]);
    }
  });

  test("both transform origins are pinned to the center during the morph", () => {
    const { fake, card, modal, options } = scene();
    card.style.transformOrigin = "10% 20%";
    modal.style.transformOrigin = "30% 40%";
    morph(card, modal, options());
    fake.flush(0);
    expect(card.style.transformOrigin).toBe("50% 50%");
    expect(modal.style.transformOrigin).toBe("50% 50%");
  });

  test("direct children are scale-corrected by default, with the inverse scale and a top-left origin", () => {
    const { fake, card, modal, cardChildren, modalChildren, options } = scene();
    morph(card, modal, options());
    for (let frame = 0; frame < 8; frame++) {
      fake.flush(frame * 16);
      for (const [element, child] of [
        [card, cardChildren[0]!],
        [modal, modalChildren[0]!],
      ] as const) {
        const applied = parseTransform(element.style.transform);
        expect(child.style.transform).toBe(`scale(${1 / applied.scaleX}, ${1 / applied.scaleY})`);
        expect(child.style.transformOrigin).toBe("0 0");
      }
    }
  });

  test("correct: [] leaves the children alone, and an explicit list is split between the elements that contain them", () => {
    const first = scene(2);
    morph(first.card, first.modal, first.options({ correct: [] }));
    first.fake.flush(0);
    expect([...first.cardChildren, ...first.modalChildren].map((child) => child.style.transform)).toEqual(["", "", "", ""]);

    const second = scene(2);
    morph(second.card, second.modal, second.options({ correct: [second.cardChildren[1]!, second.modalChildren[0]!] }));
    second.fake.flush(0);
    // Each listed child follows the scale of its own parent: the card starts at the identity, the modal at 1/3 x 1/2.
    expect(second.cardChildren.map((child) => child.style.transform)).toEqual(["", "scale(1, 1)"]);
    expect(second.modalChildren.map((child) => child.style.transform)).toEqual([`scale(${1 / (A.width / B.width)}, 2)`, ""]);
  });

  test("radius is corrected on both elements and written at rest on the one that ends at the identity", () => {
    const { fake, card, modal, options } = scene();
    const cardWrites = trackWrites(card);
    const modalWrites = trackWrites(modal);
    morph(card, modal, options({ radius: 8 }));
    fake.flush(0);
    expect(modalWrites.values("borderRadius")).toEqual([`${8 / (A.width / B.width)}px / ${8 / 0.5}px`]);
    expect(cardWrites.values("borderRadius")).toEqual(["8px / 8px"]);

    flushAll(fake, 16);
    expect(modalWrites.values("borderRadius").at(-1)).toBe("8px");
    expect(cardWrites.values("borderRadius").at(-1)).toBe(`${8 / (B.width / A.width)}px / ${8 / (B.height / A.height)}px`);
  });

  test("a zero-size box cannot be scaled to, so that axis keeps scale 1, and the inverse scale stays finite", () => {
    const world = createWorld();
    const { fake, options } = setup();
    const flat = createElement();
    const modal = createElement();
    const content = createElement(modal);
    world.place(flat, { a: { x: 0, y: 0, width: 0, height: 100 } });
    world.place(modal, { a: B });
    morph(flat, modal, options());
    fake.flush(0);
    // The origin has no width to receive the target's width ratio from, and the target starts from width 0.
    expect(parseTransform(modal.style.transform).scaleX).toBe(0);
    expect(content.style.transform).toBe(`scale(${1 / 1e-3}, ${1 / 0.5})`);

    flushAll(fake, 16);
    expect(parseTransform(flat.style.transform).scaleX).toBe(1);

    const other = createWorld();
    const hollow = createElement();
    const card = createElement();
    other.place(hollow, { a: { x: 200, y: 100, width: 0, height: 200 } });
    other.place(card, { a: A });
    morph(card, hollow, options());
    fake.flush(2000);
    expect(parseTransform(hollow.style.transform).scaleX).toBe(1);
  });
});

describe("fresh and in-flight elements", () => {
  test("a fresh origin starts from its current values, not from the identity", () => {
    const { fake, card, modal, options } = scene();
    animate(card, { x: 40 }, { ...options(), reducedMotion: "always" });
    fake.flush(0);
    expect(parseTransform(card.style.transform).x).toBe(40);

    morph(card, modal, options());
    fake.flush(16);
    expect(parseTransform(card.style.transform).x).toBe(40);
    fake.flush(32);
    expect(parseTransform(card.style.transform).x).toBeGreaterThan(40);
  });

  // The same open morph runs on two scenes for six frames; the second one is stopped before reversing, which clears its
  // velocity and makes both of its elements fresh, so it plays the part of a reversal that restarts from rest.
  function reversed() {
    const world = createWorld();
    const context = setup();
    const build = () => {
      const card = createElement();
      const modal = createElement();
      world.place(card, { a: A });
      world.place(modal, { a: B });
      createElement(card);
      createElement(modal);
      return { card, modal };
    };
    const live = build();
    const control = build();
    const options = (): MorphOptions => ({ ...context.options() });
    morph(live.card, live.modal, options());
    const controlRun = morph(control.card, control.modal, options());

    const history: { card: number[]; modal: number[]; controlCard: number[]; controlModal: number[] } = {
      card: [],
      modal: [],
      controlCard: [],
      controlModal: [],
    };
    const record = () => {
      history.card.push(centerX(world.visual(live.card)));
      history.modal.push(centerX(world.visual(live.modal)));
      history.controlCard.push(centerX(world.visual(control.card)));
      history.controlModal.push(centerX(world.visual(control.modal)));
    };
    for (let frame = 0; frame < 6; frame++) {
      context.fake.flush(frame * 16);
      record();
    }
    controlRun.stop();
    const liveBack = morph(live.modal, live.card, options());
    morph(control.modal, control.card, options());
    context.fake.flush(96);
    record();
    const step = (series: number[]): { previous: number; next: number } => ({
      previous: series.at(-2)! - series.at(-3)!,
      next: series.at(-1)! - series.at(-2)!,
    });
    return {
      ...context,
      live,
      liveBack,
      card: step(history.card),
      modal: step(history.modal),
      controlCard: step(history.controlCard),
      controlModal: step(history.controlModal),
    };
  }

  test("reversing mid-flight continues from the previous visual state with the same direction and a similar step", () => {
    const { card, modal } = reversed();
    for (const { previous, next } of [card, modal]) {
      expect(previous).toBeGreaterThan(5);
      expect(Math.sign(next)).toBe(Math.sign(previous));
      expect(next / previous).toBeGreaterThan(0.6);
      expect(next / previous).toBeLessThan(1.1);
    }
  });

  test("a reversal that restarts from rest differs: the origin barely moves and the target snaps to the other box", () => {
    const { card, modal, controlCard, controlModal } = reversed();
    // The control's origin (the modal) lost its velocity, so its first step is a fraction of the inherited one.
    expect(Math.abs(controlModal.next)).toBeLessThan(Math.abs(modal.next) / 3);
    // The control's target (the card) is fresh, so it jumps to the other box instead of continuing.
    expect(Math.abs(controlCard.next)).toBeGreaterThan(Math.abs(card.next) * 10);
  });

  test("the superseded morph resolves false and the reversal settles with the exact end states", async () => {
    const { live, liveBack, fake, scheduler } = reversed();
    flushAll(fake, 112);
    expect(await liveBack.finished).toBe(true);
    expect(live.card.style.transform).toBe(IDENTITY);
    expect(live.modal.style.transform).toBe(transform(centerX(A) - centerX(B), centerY(A) - centerY(B), A.width / B.width, 0.5));
    expect(scheduler.active).toBe(false);
  });
});

describe("crossfade", () => {
  test("the combined coverage never dips below 0.85 on any frame", () => {
    const { fake, card, modal, options } = scene();
    morph(card, modal, options());
    let timestamp = 0;
    let lowest = 1;
    while (fake.pending > 0 && timestamp < 3000) {
      fake.flush(timestamp);
      lowest = Math.min(lowest, 1 - (1 - opacityOf(modal)) * (1 - opacityOf(card)));
      timestamp += 16;
    }
    expect(lowest).toBeGreaterThanOrEqual(0.85);
    expect(opacityOf(modal)).toBe(1);
    expect(opacityOf(card)).toBe(0);
  });

  test("a fresh target jumps to 0 and fades in with the faster spring while the origin fades out with the full one", () => {
    const { fake, card, modal, options } = scene();
    modal.style.opacity = "1";
    morph(card, modal, options());
    fake.flush(0);
    expect(modal.style.opacity).toBe("0");
    fake.flush(80);
    expect(Number(modal.style.opacity)).toBe(createSpring(0, 1, 0, FADE_IN).at(0.08).position);
    expect(Number(card.style.opacity)).toBe(createSpring(1, 0, 0, FADE_OUT).at(0.08).position);
  });

  test("the fades follow the perceptual duration of the options", () => {
    const { fake, card, modal, options } = scene();
    morph(card, modal, options({ duration: 0.8, bounce: 0.3 }));
    fake.flush(0);
    fake.flush(80);
    expect(Number(modal.style.opacity)).toBe(createSpring(0, 1, 0, { duration: 0.4, bounce: 0 }).at(0.08).position);
    expect(Number(card.style.opacity)).toBe(createSpring(1, 0, 0, { duration: 0.8, bounce: 0 }).at(0.08).position);
  });

  test("physical spring options drive both fades with that same spring", () => {
    const { fake, scheduler, card, modal } = scene();
    const physical = { stiffness: 200, damping: 30 };
    morph(card, modal, { scheduler, ...physical });
    fake.flush(0);
    fake.flush(80);
    expect(Number(modal.style.opacity)).toBe(createSpring(0, 1, 0, physical).at(0.08).position);
    expect(Number(card.style.opacity)).toBe(createSpring(1, 0, 0, physical).at(0.08).position);
  });

  test("crossfade: false leaves opacity untouched", () => {
    const { fake, card, modal, options } = scene();
    const writes = [trackWrites(card), trackWrites(modal)];
    morph(card, modal, options({ crossfade: false }));
    flushAll(fake);
    expect(writes.map((entry) => entry.values("opacity"))).toEqual([[], []]);
    expect(card.style.opacity).toBe("");
    expect(modal.style.opacity).toBe("");
  });
});

describe("blur", () => {
  test("incoming children go from the blur radius to 0 and outgoing ones from 0 to the radius", () => {
    const { fake, card, modal, cardChildren, modalChildren, options } = scene();
    morph(card, modal, options());
    fake.flush(0);
    expect(modalChildren[0]!.style.filter).toBe("blur(8px)");
    expect(cardChildren[0]!.style.filter).toBe("");

    fake.flush(80);
    expect(blurOf(modalChildren[0]!)).toBe(createSpring(8, 0, 0, FADE_IN).at(0.08).position);
    expect(blurOf(cardChildren[0]!)).toBe(createSpring(0, 8, 0, FADE_OUT).at(0.08).position);

    flushAll(fake, 96);
    expect(modalChildren[0]!.style.filter).toBe("");
    expect(cardChildren[0]!.style.filter).toBe("blur(8px)");
  });

  test("the shells never get a filter, so their edges stay crisp", () => {
    const { fake, card, modal, options } = scene();
    const writes = [trackWrites(card), trackWrites(modal)];
    morph(card, modal, options());
    flushAll(fake);
    expect(writes.map((entry) => entry.values("filter"))).toEqual([[], []]);
  });

  test("the blur writes only filter, so the parent's inverse-scale transform on a child is never disturbed", () => {
    const { fake, modalChildren, card, modal, options } = scene();
    const child = modalChildren[0]!;
    const writes = trackWrites(child);
    morph(card, modal, options());
    for (let frame = 0; frame < 12; frame++) {
      fake.flush(frame * 16);
      const applied = parseTransform(modal.style.transform);
      expect(child.style.transform).toBe(`scale(${1 / applied.scaleX}, ${1 / applied.scaleY})`);
    }
    flushAll(fake, 192);
    expect(writes.values("filter").length).toBeGreaterThan(1);
    // Every transform write comes from the parent's hook: an inverse scale, or the clearing write at rest.
    for (const value of writes.values("transform")) expect(value === "" || value.startsWith("scale(")).toBe(true);
    expect(child.style.transform).toBe("");
  });

  test("blur: 0 writes no filter at all, and a custom radius is used", () => {
    const off = scene();
    const offWrites = [...off.cardChildren, ...off.modalChildren].map(trackWrites);
    morph(off.card, off.modal, off.options({ blur: 0 }));
    flushAll(off.fake);
    expect(offWrites.map((entry) => entry.values("filter"))).toEqual([[], []]);
    expect(off.modalChildren[0]!.style.transform).toBe("");

    const custom = scene();
    morph(custom.card, custom.modal, custom.options({ blur: 3 }));
    custom.fake.flush(0);
    expect(custom.modalChildren[0]!.style.filter).toBe("blur(3px)");
  });

  test("blur is independent of the crossfade switch", () => {
    const { fake, card, modal, modalChildren, options } = scene();
    morph(card, modal, options({ crossfade: false }));
    fake.flush(0);
    expect(modalChildren[0]!.style.filter).toBe("blur(8px)");
  });
});

describe("reduced motion", () => {
  test('"always" jumps the spatial values but still crossfades and blurs', async () => {
    const { fake, card, modal, cardChildren, modalChildren, options } = scene();
    const run = morph(card, modal, options({ reducedMotion: "always", radius: 8 }));
    fake.flush(0);
    expect(modal.style.transform).toBe(IDENTITY);
    expect(modal.style.borderRadius).toBe("8px");
    expect(card.style.transform).toBe(transform(300, 150, 3, 2));
    expect(modalChildren[0]!.style.transform).toBe("");
    expect(cardChildren[0]!.style.transform).toBe(`scale(${1 / 3}, ${1 / 2})`);
    expect(fake.pending).toBe(1);

    fake.flush(80);
    expect(opacityOf(modal)).toBeGreaterThan(0);
    expect(opacityOf(modal)).toBeLessThan(1);
    expect(blurOf(modalChildren[0]!)).toBeGreaterThan(0);
    expect(blurOf(modalChildren[0]!)).toBeLessThan(8);
    expect(card.style.transform).toBe(transform(300, 150, 3, 2));

    flushAll(fake, 96);
    expect(await run.finished).toBe(true);
    expect(opacityOf(modal)).toBe(1);
  });

  test('"user" follows prefers-reduced-motion', () => {
    stubMatchMedia(true);
    const { fake, card, modal, options } = scene();
    morph(card, modal, options());
    fake.flush(0);
    expect(modal.style.transform).toBe(IDENTITY);
    expect(card.style.transform).toBe(transform(300, 150, 3, 2));
  });
});

describe("finished and stop", () => {
  test("finished resolves true after settling and the scheduler goes idle", async () => {
    const { fake, scheduler, card, modal, options } = scene();
    const run = morph(card, modal, options());
    let resolved: boolean | undefined;
    void run.finished.then((value) => {
      resolved = value;
    });
    fake.flush(0);
    fake.flush(16);
    await Promise.resolve();
    expect(resolved).toBeUndefined();

    flushAll(fake, 32);
    expect(await run.finished).toBe(true);
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
  });

  test("a newer morph touching either element resolves the older one false", async () => {
    const world = createWorld();
    const { fake, options } = setup();
    const [a, b, c, d] = [createElement(), createElement(), createElement(), createElement()] as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    world.place(a, { a: A });
    world.place(b, { a: B });
    world.place(c, { a: A });
    world.place(d, { a: B });

    const throughTarget = morph(a, b, options());
    const throughOrigin = morph(c, d, options());
    fake.flush(0);
    morph(c, b, options());
    flushAll(fake, 16);
    expect(await throughTarget.finished).toBe(false);
    expect(await throughOrigin.finished).toBe(false);

    const third = morph(a, d, options());
    const fourth = morph(d, a, options());
    flushAll(fake, 2000);
    expect(await third.finished).toBe(false);
    expect(await fourth.finished).toBe(true);
  });

  test("stop() freezes the morph, keeps corrections applied and resolves finished false", async () => {
    const { fake, scheduler, card, modal, modalChildren, options } = scene();
    const run = morph(card, modal, options({ radius: 12 }));
    fake.flush(0);
    fake.flush(48);
    run.stop();
    const frozen = [card.style.transform, modal.style.transform, card.style.opacity, modal.style.opacity, modalChildren[0]!.style.filter];
    expect(await run.finished).toBe(false);
    flushAll(fake, 64);
    expect([card.style.transform, modal.style.transform, card.style.opacity, modal.style.opacity, modalChildren[0]!.style.filter]).toEqual(frozen);
    expect(frozen[1]).not.toBe(IDENTITY);
    expect(scheduler.active).toBe(false);

    // A later transform write on the frozen element must not treat it as finished.
    animate(modal, { rotate: 1 }, options());
    fake.flush(2000);
    const applied = parseTransform(modal.style.transform);
    expect(applied.scaleX).not.toBe(1);
    expect(modalChildren[0]!.style.transform).toBe(`scale(${1 / applied.scaleX}, ${1 / applied.scaleY})`);
    expect(modal.style.borderRadius).not.toBe("12px");
  });

  test("stop() on a superseded morph leaves the newer morph running", async () => {
    const { fake, card, modal, options } = scene();
    const first = morph(card, modal, options());
    for (let frame = 0; frame < 4; frame++) fake.flush(frame * 16);
    const second = morph(modal, card, options());
    first.stop();
    flushAll(fake, 64);
    expect(await first.finished).toBe(false);
    expect(await second.finished).toBe(true);
    expect(card.style.transform).toBe(IDENTITY);
  });

  test("stop() after the morph settled changes nothing", async () => {
    const { fake, card, modal, options } = scene();
    const run = morph(card, modal, options());
    flushAll(fake);
    const settled = [card.style.transform, modal.style.transform];
    run.stop();
    expect(await run.finished).toBe(true);
    expect([card.style.transform, modal.style.transform]).toEqual(settled);
  });
});

describe("open, then fully close", () => {
  test("the card is back at the identity, clean, and the modal rests on the card box", async () => {
    const { fake, scheduler, card, modal, cardChildren, modalChildren, options } = scene();
    card.style.transformOrigin = "10% 20%";
    modal.style.transformOrigin = "30% 40%";

    const open = morph(card, modal, options());
    flushAll(fake);
    expect(await open.finished).toBe(true);

    // After the open the modal is at the identity and restored, the card rests on the modal box.
    expect(modal.style.transform).toBe(IDENTITY);
    expect(modal.style.transformOrigin).toBe("30% 40%");
    expect(modalChildren[0]!.style.transform).toBe("");
    expect(modalChildren[0]!.style.filter).toBe("");
    expect(card.style.transform).toBe(transform(300, 150, 3, 2));
    expect(card.style.transformOrigin).toBe("50% 50%");
    expect(opacityOf(card)).toBe(0);
    expect(cardChildren[0]!.style.filter).toBe("blur(8px)");

    const close = morph(modal, card, options());
    flushAll(fake, 100_000);
    expect(await close.finished).toBe(true);

    expect(card.style.transform).toBe(IDENTITY);
    expect(card.style.opacity).toBe("1");
    expect(card.style.transformOrigin).toBe("10% 20%");
    expect(cardChildren[0]!.style.transform).toBe("");
    expect(cardChildren[0]!.style.transformOrigin).toBe("");
    expect(cardChildren[0]!.style.filter).toBe("");

    const scaleX = A.width / B.width;
    expect(modal.style.transform).toBe(transform(centerX(A) - centerX(B), centerY(A) - centerY(B), scaleX, 0.5));
    expect(modal.style.opacity).toBe("0");
    expect(modal.style.transformOrigin).toBe("50% 50%");
    expect(modalChildren[0]!.style.transform).toBe(`scale(${1 / scaleX}, ${1 / 0.5})`);
    expect(modalChildren[0]!.style.filter).toBe("blur(8px)");
    expect(scheduler.active).toBe(false);
    expect(fake.pending).toBe(0);
  });
});
