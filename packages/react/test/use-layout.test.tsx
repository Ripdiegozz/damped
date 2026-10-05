import { afterEach, describe, expect, test } from "bun:test";
import { StrictMode, Suspense, act, startTransition, use, useLayoutEffect, useState, type RefCallback } from "react";
import { createSpring, type LayoutOptions } from "damped";
import { peekSpringValue } from "../../core/src/animate";
import { A, B, C, IDENTITY, SPRING, centerX, centerY, createWorld, parseTransform } from "../../core/test/layout-world";
import { useLayout } from "../src";
import { cleanup, createTestScheduler, mount, runFrames } from "./harness";

afterEach(cleanup);

const LENGTH = { restDelta: 0.01, restSpeed: 0.1 };
type World = ReturnType<typeof createWorld>;

function setup() {
  const test = createTestScheduler();
  const world = createWorld("a");
  const options = (extra: Partial<LayoutOptions> = {}): LayoutOptions => ({ ...SPRING, scheduler: test.scheduler, ...extra });
  return { ...test, world, options };
}

// Declared before useLayout on purpose: layout effects of one component run in declaration order, so the "DOM
// mutation" (the world state, standing for what React writes in its mutation phase) lands before useLayout's own.
function Box({
  world,
  state,
  opts,
  boxes = { a: A, b: B, c: C },
}: {
  world: World;
  state: string;
  opts: LayoutOptions;
  boxes?: Record<string, typeof A>;
  "data-tick"?: number;
}) {
  useLayoutEffect(() => {
    world.state = state;
  }, [world, state]);
  const layoutRef = useLayout<HTMLDivElement>([state], opts);
  const ref: RefCallback<HTMLDivElement> = (node) => {
    if (node !== null) world.place(node, boxes);
    return layoutRef(node);
  };
  return <div ref={ref} />;
}

describe("useLayout", () => {
  test("a deps change animates from the box recorded before the commit", () => {
    const { fake, world, options } = setup();
    const view = mount(<Box world={world} state="a" opts={options()} />);
    const box = view.container.firstElementChild as HTMLElement;
    expect(fake.pending).toBe(0);

    view.rerender(<Box world={world} state="b" opts={options()} />);
    fake.flush(0);

    const start = parseTransform(box.style.transform);
    expect(start.x).toBeCloseTo(centerX(A) - centerX(B), 6);
    expect(start.y).toBeCloseTo(centerY(A) - centerY(B), 6);
    expect(start.scaleX).toBeCloseTo(A.width / B.width, 6);
    expect(start.scaleY).toBeCloseTo(A.height / B.height, 6);

    runFrames(fake, 120, 16);
    expect(box.style.transform).toBe(IDENTITY);
    expect(fake.pending).toBe(0);
  });

  test("a re-render with equal deps neither reads the layout nor animates", () => {
    const { fake, world, options } = setup();
    const view = mount(<Box world={world} state="a" opts={options()} />);
    const reads = world.reads;
    const requests = fake.requests;

    view.rerender(<Box world={world} state="a" opts={options()} />);
    view.rerender(<Box world={world} state="a" opts={options({ duration: 0.1 })} />);

    expect(world.reads).toBe(reads);
    expect(fake.requests).toBe(requests);
  });

  test("a deps change that does not move the element does not animate", () => {
    const { fake, world, options } = setup();
    const view = mount(<Box world={world} state="a" opts={options()} boxes={{ a: A, b: A }} />);

    view.rerender(<Box world={world} state="b" opts={options()} boxes={{ a: A, b: A }} />);

    expect(fake.pending).toBe(0);
  });

  test("uses the options of the render that commits", () => {
    const { fake, world, options } = setup();
    const view = mount(<Box world={world} state="a" opts={options({ duration: 0.5 })} />);
    const box = view.container.firstElementChild as HTMLElement;

    view.rerender(<Box world={world} state="b" opts={options({ duration: 0.2, bounce: 0 })} />);
    fake.flush(0);
    fake.flush(80);

    const expected = createSpring(centerX(A) - centerX(B), 0, 0, { duration: 0.2, bounce: 0, ...LENGTH }).at(0.08).position;
    expect(parseTransform(box.style.transform).x).toBeCloseTo(expected, 6);
  });

  test("a second change in flight inherits the velocity of the first", () => {
    const { fake, world, options } = setup();
    const view = mount(<Box world={world} state="a" opts={options()} />);
    const box = view.container.firstElementChild as HTMLElement;
    view.rerender(<Box world={world} state="b" opts={options()} />);
    runFrames(fake, 6);
    const velocity = peekSpringValue(box, "x")!.getVelocity();
    expect(velocity).not.toBe(0);

    view.rerender(<Box world={world} state="a" opts={options()} />);

    expect(peekSpringValue(box, "x")!.getVelocity()).toBeCloseTo(velocity, 6);
  });

  test("does not re-render across animation frames", () => {
    const { fake, world, options } = setup();
    let renders = 0;
    function Counted({ state }: { state: string }) {
      renders++;
      return <Box world={world} state={state} opts={options()} />;
    }
    const view = mount(<Counted state="a" />);
    view.rerender(<Counted state="b" />);
    const committed = renders;

    runFrames(fake, 120);

    expect(fake.requests).toBeGreaterThan(0);
    expect(fake.pending).toBe(0);
    expect(renders).toBe(committed);
  });

  test("StrictMode's double render and effects produce a single, correct animation", () => {
    const { fake, world, options } = setup();
    const tree = (state: string) => (
      <StrictMode>
        <Box world={world} state={state} opts={options()} />
      </StrictMode>
    );
    const view = mount(tree("a"));
    const box = view.container.firstElementChild as HTMLElement;
    expect(fake.pending).toBe(0);

    view.rerender(tree("b"));
    fake.flush(0);

    expect(parseTransform(box.style.transform).x).toBeCloseTo(centerX(A) - centerX(B), 6);
    runFrames(fake, 120, 16);
    expect(box.style.transform).toBe(IDENTITY);
  });

  test("a snapshot taken by a discarded render never animates a later commit", async () => {
    const { fake, world, options } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let setState!: (state: string) => void;
    let bump!: () => void;
    function Gate({ state }: { state: string }) {
      if (state === "b") use(gate);
      return null;
    }
    function Host() {
      const [state, set] = useState("a");
      const [tick, setTick] = useState(0);
      setState = set;
      bump = () => setTick((value) => value + 1);
      return (
        <Suspense fallback={null}>
          <Box world={world} state={state} opts={options()} data-tick={tick} />
          <Gate state={state} />
        </Suspense>
      );
    }
    const view = mount(<Host />);
    const box = view.container.firstElementChild as HTMLElement;
    const reads = world.reads;

    // The transition renders Box (taking a snapshot) and then suspends, so nothing commits.
    await act(async () => {
      startTransition(() => setState("b"));
    });
    expect(world.reads).toBeGreaterThan(reads);
    expect(world.state).toBe("a");
    expect(fake.pending).toBe(0);

    // An urgent render with the committed deps lands while an unrelated layout shift moved the element: the
    // abandoned snapshot (taken at box A) must not turn that shift into an animation.
    world.state = "c";
    await act(async () => {
      bump();
    });
    expect(fake.pending).toBe(0);
    expect(box.style.transform).toBe("");

    world.state = "a";
    // Retrying the transition records a fresh snapshot and animates from the box that is on screen.
    await act(async () => {
      startTransition(() => setState("b"));
    });
    await act(async () => {
      release();
    });
    expect(world.state).toBe("b");
    fake.flush(0);
    const start = parseTransform(box.style.transform);
    expect(start.x).toBeCloseTo(centerX(A) - centerX(B), 6);
    runFrames(fake, 120, 16);
    expect(box.style.transform).toBe(IDENTITY);
  });
});
