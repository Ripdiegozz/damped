import { afterEach, describe, expect, test } from "bun:test";
import { StrictMode, act, type RefCallback } from "react";
import { createSpring, morph, type MorphOptions } from "damped";
import { peekSpringValue } from "../../core/src/animate";
import { A, B, IDENTITY, SPRING, centerX, createWorld, parseTransform } from "../../core/test/layout-world";
import { useMorph } from "../src";
import { cleanup, createTestScheduler, mount, runFrames, settle } from "./harness";

afterEach(cleanup);

type Handle = ReturnType<typeof useMorph>;

function setup() {
  const test = createTestScheduler();
  const world = createWorld("a");
  // Every layout read records whether the element was hidden at that moment.
  const sawHidden: boolean[] = [];
  const options = (extra: Partial<MorphOptions> = {}): MorphOptions => ({ ...SPRING, scheduler: test.scheduler, ...extra });
  const place = (box: typeof A): RefCallback<HTMLElement> => {
    return (node) => {
      if (node === null) return;
      world.place(node, { a: box });
      const read = node.getBoundingClientRect;
      node.getBoundingClientRect = () => {
        sawHidden.push(node.hidden === true);
        return read();
      };
    };
  };
  let handle!: Handle;
  let renders = 0;
  // Stable ref callbacks, as an app would write them: the tests that need an unstable one build it themselves.
  const sourceRef = place(A);
  const targetRef = place(B);
  function Demo({ opts }: { opts?: MorphOptions }) {
    renders++;
    handle = useMorph(opts);
    const { source, target } = handle;
    return (
      <>
        <div id="source" ref={(node) => (sourceRef(node), source(node))} />
        <div id="target" ref={(node) => (targetRef(node), target(node))} />
      </>
    );
  }
  return { ...test, world, options, sawHidden, Demo, handle: () => handle, renders: () => renders };
}

const elements = (container: HTMLElement) => ({
  source: container.querySelector("#source") as HTMLElement,
  target: container.querySelector("#target") as HTMLElement,
});

describe("useMorph", () => {
  test("keeps the closed target hidden through the DOM attribute, without a hidden prop", () => {
    const { Demo, options } = setup();
    const view = mount(<Demo opts={options()} />);
    const { source, target } = elements(view.container);

    expect(target.hidden).toBe(true);
    expect(source.hidden).toBe(false);

    view.rerender(<Demo opts={options()} />);
    expect(target.hidden).toBe(true);
  });

  test("open() re-renders once with isOpen true and unhides the target before measuring", async () => {
    const { Demo, options, handle, renders, sawHidden, fake } = setup();
    const view = mount(<Demo opts={options()} />);
    const { target } = elements(view.container);
    expect(handle().isOpen).toBe(false);
    const rendered = renders();

    let opened!: Promise<boolean>;
    act(() => {
      opened = handle().open();
    });

    expect(handle().isOpen).toBe(true);
    expect(renders()).toBe(rendered + 1);
    expect(target.hidden).toBe(false);
    expect(sawHidden.length).toBeGreaterThan(0);
    expect(sawHidden.every((hidden) => !hidden)).toBe(true);

    runFrames(fake, 120);
    expect(await opened).toBe(true);
  });

  test("open() morphs the target from the source box to its own and fades the source out", async () => {
    const { Demo, options, handle, fake } = setup();
    const view = mount(<Demo opts={options()} />);
    const { source, target } = elements(view.container);

    let opened!: Promise<boolean>;
    act(() => {
      opened = handle().open();
    });
    fake.flush(0);
    const start = parseTransform(target.style.transform);
    expect(start.x).toBeCloseTo(centerX(A) - centerX(B), 6);
    expect(start.scaleX).toBeCloseTo(A.width / B.width, 6);

    runFrames(fake, 120, 16);
    expect(await opened).toBe(true);
    expect(target.style.transform).toBe(IDENTITY);
    expect(target.style.opacity).toBe("1");
    expect(source.style.opacity).toBe("0");
    expect(target.hidden).toBe(false);
  });

  test("close() re-renders once with isOpen false, reverses the morph and re-hides the target once it resolves true", async () => {
    const { Demo, options, handle, renders, fake } = setup();
    const view = mount(<Demo opts={options()} />);
    const { source, target } = elements(view.container);
    act(() => void handle().open());
    runFrames(fake, 120);
    await settle();
    const rendered = renders();

    let closed!: Promise<boolean>;
    act(() => {
      closed = handle().close();
    });
    expect(handle().isOpen).toBe(false);
    expect(renders()).toBe(rendered + 1);
    // Still visible while it travels back.
    expect(target.hidden).toBe(false);

    runFrames(fake, 120, 2000);
    expect(await closed).toBe(true);
    expect(target.hidden).toBe(true);
    expect(source.style.opacity).toBe("1");
    expect(source.style.transform).toBe(IDENTITY);
  });

  test("close() in the middle of open() reverses with velocity and the superseded morph does not hide the target", async () => {
    const { Demo, options, handle, fake } = setup();
    const view = mount(<Demo opts={options()} />);
    const { target } = elements(view.container);
    let opened!: Promise<boolean>;
    act(() => {
      opened = handle().open();
    });
    const next = runFrames(fake, 6);
    const velocity = peekSpringValue(target, "x")!.getVelocity();
    expect(velocity).not.toBe(0);

    let closed!: Promise<boolean>;
    act(() => {
      closed = handle().close();
    });
    // The reversal continues from the velocity of the opening instead of restarting from rest.
    expect(peekSpringValue(target, "x")!.getVelocity()).toBe(velocity);

    expect(await opened).toBe(false);
    expect(target.hidden).toBe(false);

    runFrames(fake, 150, next);
    expect(await closed).toBe(true);
    expect(target.hidden).toBe(true);
  });

  test("open() in the middle of close() keeps the target visible", async () => {
    const { Demo, options, handle, fake } = setup();
    const view = mount(<Demo opts={options()} />);
    const { target } = elements(view.container);
    act(() => void handle().open());
    const afterOpen = runFrames(fake, 120);
    await settle();

    let closed!: Promise<boolean>;
    act(() => {
      closed = handle().close();
    });
    const next = runFrames(fake, 5, afterOpen);
    let reopened!: Promise<boolean>;
    act(() => {
      reopened = handle().open();
    });

    expect(await closed).toBe(false);
    expect(target.hidden).toBe(false);
    expect(handle().isOpen).toBe(true);

    runFrames(fake, 150, next);
    expect(await reopened).toBe(true);
    expect(target.hidden).toBe(false);
  });

  test("a morph started outside the hook that cuts close() leaves the target visible", async () => {
    const { Demo, options, handle, fake } = setup();
    const view = mount(<Demo opts={options()} />);
    const { source, target } = elements(view.container);
    act(() => void handle().open());
    const next = runFrames(fake, 120);
    await settle();

    let closed!: Promise<boolean>;
    act(() => {
      closed = handle().close();
    });
    runFrames(fake, 3, next);
    morph(source, target, options());

    expect(await closed).toBe(false);
    expect(target.hidden).toBe(false);
  });

  test("open() while opening returns the same promise, and close() while closed resolves without a morph", async () => {
    const { Demo, options, handle, renders, fake } = setup();
    mount(<Demo opts={options()} />);

    expect(await handle().close()).toBe(true);
    expect(fake.requests).toBe(0);

    let first!: Promise<boolean>;
    act(() => {
      first = handle().open();
    });
    const rendered = renders();
    const second = handle().open();

    expect(second).toBe(first);
    expect(renders()).toBe(rendered);
  });

  test("never re-renders across animation frames", async () => {
    const { Demo, options, handle, renders, fake } = setup();
    mount(<Demo opts={options()} />);
    act(() => void handle().open());
    const rendered = renders();

    const next = runFrames(fake, 40);
    expect(fake.pending).toBeGreaterThan(0);
    expect(renders()).toBe(rendered);

    act(() => void handle().close());
    const closing = renders();
    runFrames(fake, 150, next);
    await settle();
    expect(fake.pending).toBe(0);
    expect(renders()).toBe(closing);
  });

  test("uses the options of the latest render for the next morph", async () => {
    const { Demo, options, handle, fake } = setup();
    const view = mount(<Demo opts={options({ duration: 0.5 })} />);
    const { target } = elements(view.container);
    view.rerender(<Demo opts={options({ duration: 0.2, bounce: 0 })} />);

    act(() => void handle().open());
    fake.flush(0);
    fake.flush(80);

    const expected = createSpring(centerX(A) - centerX(B), 0, 0, { duration: 0.2, bounce: 0, restDelta: 0.01, restSpeed: 0.1 }).at(0.08).position;
    expect(parseTransform(target.style.transform).x).toBeCloseTo(expected, 6);
    runFrames(fake, 120, 96);
    await settle();
  });

  test("returns stable open and close functions", () => {
    const { Demo, options, handle } = setup();
    const view = mount(<Demo opts={options()} />);
    const { open, close } = handle();

    view.rerender(<Demo opts={options()} />);

    expect(handle().open).toBe(open);
    expect(handle().close).toBe(close);
  });

  test("open() and close() resolve false, and stay closed, when the elements are not mounted", async () => {
    const { options } = setup();
    let bare!: Handle;
    function Bare() {
      bare = useMorph(options());
      return null;
    }
    mount(<Bare />);

    expect(await bare.open()).toBe(false);
    expect(await bare.close()).toBe(true);
    expect(bare.isOpen).toBe(false);
  });

  test("unmounting in the middle of a morph stops it", async () => {
    const { Demo, options, handle, fake } = setup();
    const view = mount(<Demo opts={options()} />);
    let opened!: Promise<boolean>;
    act(() => {
      opened = handle().open();
    });
    runFrames(fake, 4);

    view.unmount();
    runFrames(fake, 2, 200);

    expect(await opened).toBe(false);
    expect(fake.pending).toBe(0);
  });

  test("survives StrictMode and still opens and closes", async () => {
    const { Demo, options, handle, fake } = setup();
    const view = mount(
      <StrictMode>
        <Demo opts={options()} />
      </StrictMode>,
    );
    const { target } = elements(view.container);
    expect(target.hidden).toBe(true);

    let opened!: Promise<boolean>;
    act(() => {
      opened = handle().open();
    });
    const next = runFrames(fake, 120);
    expect(await opened).toBe(true);

    let closed!: Promise<boolean>;
    act(() => {
      closed = handle().close();
    });
    runFrames(fake, 150, next);
    expect(await closed).toBe(true);
    expect(target.hidden).toBe(true);
  });

  test("a ref callback that changes every render neither re-hides a visible target nor interrupts the morph", async () => {
    const { Demo, options, handle, fake } = setup();
    const view = mount(<Demo opts={options()} />);
    const { target } = elements(view.container);
    act(() => void handle().open());
    const next = runFrames(fake, 4);

    // Demo's inline ref callbacks are new functions on every render, so React detaches and re-attaches them.
    view.rerender(<Demo opts={options()} />);

    expect(target.hidden).toBe(false);
    runFrames(fake, 120, next);
    await settle();
    expect(target.style.transform).toBe(IDENTITY);
  });
});
