import { afterEach, describe, expect, test } from "bun:test";
import { StrictMode, act, useEffect, useState, type RefCallback } from "react";
import { createSpring, type AnimateOptions, type AnimationTargets } from "@damped/core";
import { peekSpringValue } from "../../core/src/animate";
import { useSpring } from "../src";
import { cleanup, createTestScheduler, mount, runFrames } from "./harness";

afterEach(cleanup);

const SPRING = { duration: 0.5, bounce: 0 } as const;
// Rest thresholds animate() applies to lengths; needed to rebuild the exact spring.
const LENGTH = { restDelta: 0.01, restSpeed: 0.1 };
const at = (x: number): string => `translate3d(${x}px, 0px, 0) rotate(0deg) scale(1, 1)`;

function setup() {
  const test = createTestScheduler();
  const options = (extra: Partial<AnimateOptions> = {}): AnimateOptions => ({ ...SPRING, scheduler: test.scheduler, ...extra });
  return { ...test, options };
}

describe("useSpring", () => {
  test("applies the targets on mount and settles on them", () => {
    const { fake, options } = setup();
    function Box() {
      const ref = useSpring<HTMLDivElement>({ x: 100 }, options());
      return <div ref={ref} data-testid="box" />;
    }
    const view = mount(<Box />);
    const box = view.container.firstElementChild as HTMLElement;

    expect(fake.pending).toBeGreaterThan(0);
    runFrames(fake, 80);

    expect(box.style.transform).toBe(at(100));
    expect(fake.pending).toBe(0);
  });

  test("starts the animation in a layout effect, before passive effects", () => {
    const { options, log } = setup();
    const order: string[] = [];
    function Box() {
      // Declared first, so it runs before the passive effect of useSpring (if that were one).
      useEffect(() => {
        order.push(...log, "passive");
      }, []);
      const ref = useSpring<HTMLDivElement>({ x: 100 }, options());
      return <div ref={ref} />;
    }
    mount(<Box />);

    expect(order).toEqual(["loop:update", "passive"]);
  });

  test("animates to new target values and inherits the velocity of the running animation", () => {
    const { fake, options } = setup();
    function Box({ x }: { x: number }) {
      const ref = useSpring<HTMLDivElement>({ x }, options());
      return <div ref={ref} />;
    }
    const view = mount(<Box x={100} />);
    const box = view.container.firstElementChild as HTMLElement;
    const next = runFrames(fake, 6);
    const value = peekSpringValue(box, "x")!;
    const velocity = value.getVelocity();
    expect(velocity).toBeGreaterThan(0);

    view.rerender(<Box x={0} />);

    expect(value.getVelocity()).toBe(velocity);
    runFrames(fake, 80, next);
    expect(box.style.transform).toBe(at(0));
  });

  test("a re-render with equal values, even in a new object, does nothing", () => {
    const { fake, options } = setup();
    function Box({ targets }: { targets: AnimationTargets }) {
      const ref = useSpring<HTMLDivElement>(targets, options());
      return <div ref={ref} />;
    }
    const view = mount(<Box targets={{ x: 50, opacity: 0.5 }} />);
    runFrames(fake, 80);
    expect(fake.pending).toBe(0);
    const requests = fake.requests;

    view.rerender(<Box targets={{ opacity: 0.5, x: 50 }} />);
    view.rerender(<Box targets={{ x: 50, opacity: 0.5 }} />);

    expect(fake.requests).toBe(requests);
    expect(fake.pending).toBe(0);
  });

  test("a re-render with equal values mid-flight leaves the running spring untouched", () => {
    const { fake, options } = setup();
    function Box({ targets }: { targets: AnimationTargets }) {
      const ref = useSpring<HTMLDivElement>(targets, options());
      return <div ref={ref} />;
    }
    const view = mount(<Box targets={{ x: 100 }} />);
    const box = view.container.firstElementChild as HTMLElement;
    runFrames(fake, 4);

    view.rerender(<Box targets={{ x: 100 }} />);
    fake.flush(4 * 16);

    // A restarted spring would follow a different curve than the original one.
    const original = createSpring(0, 100, 0, { ...SPRING, ...LENGTH }).at(0.064).position;
    expect(box.style.transform).toBe(at(original));
  });

  test("changing one of several target values animates only toward the new set", () => {
    const { fake, options } = setup();
    function Box({ targets }: { targets: AnimationTargets }) {
      const ref = useSpring<HTMLDivElement>(targets, options());
      return <div ref={ref} />;
    }
    const view = mount(<Box targets={{ x: 50, opacity: 0.5 }} />);
    const box = view.container.firstElementChild as HTMLElement;
    runFrames(fake, 80);

    view.rerender(<Box targets={{ x: 50, opacity: 1 }} />);
    runFrames(fake, 80);

    expect(box.style.transform).toBe(at(50));
    expect(box.style.opacity).toBe("1");
  });

  test("changing only the options does not retrigger the animation", () => {
    const { fake, options } = setup();
    function Box({ duration }: { duration: number }) {
      const ref = useSpring<HTMLDivElement>({ x: 100 }, options({ duration }));
      return <div ref={ref} />;
    }
    const view = mount(<Box duration={0.5} />);
    runFrames(fake, 80);
    const requests = fake.requests;

    view.rerender(<Box duration={0.1} />);

    expect(fake.requests).toBe(requests);
    expect(fake.pending).toBe(0);
  });

  test("reads the options of the latest render when the targets change", () => {
    const { fake, options } = setup();
    function Box({ x, duration }: { x: number; duration: number }) {
      const ref = useSpring<HTMLDivElement>({ x }, options({ duration }));
      return <div ref={ref} />;
    }
    const view = mount(<Box x={100} duration={0.5} />);
    const next = runFrames(fake, 80);
    view.rerender(<Box x={100} duration={0.2} />);
    view.rerender(<Box x={0} duration={0.2} />);
    const box = view.container.firstElementChild as HTMLElement;

    fake.flush(next);
    fake.flush(next + 80);

    const expected = createSpring(100, 0, 0, { duration: 0.2, bounce: 0, ...LENGTH }).at(0.08).position;
    expect(box.style.transform).toBe(at(expected));
  });

  test("does not re-render across animation frames", () => {
    const { fake, options } = setup();
    let renders = 0;
    function Box({ x }: { x: number }) {
      renders++;
      const ref = useSpring<HTMLDivElement>({ x, opacity: x / 100 }, options());
      return <div ref={ref} />;
    }
    const view = mount(<Box x={100} />);
    const mounted = renders;

    const next = runFrames(fake, 30);
    expect(fake.pending).toBeGreaterThan(0);
    expect(renders).toBe(mounted);

    view.rerender(<Box x={0} />);
    const rerendered = renders;
    runFrames(fake, 80, next);
    expect(fake.pending).toBe(0);
    expect(renders).toBe(rerendered);
  });

  test("keeps animating when the ref is wrapped in a callback that changes every render", () => {
    const { fake, options } = setup();
    function Box({ tick }: { tick: number }) {
      const ref = useSpring<HTMLDivElement>({ x: 100 }, options());
      return <div ref={(node) => ref(node)} data-tick={tick} />;
    }
    const view = mount(<Box tick={0} />);
    const box = view.container.firstElementChild as HTMLElement;
    const next = runFrames(fake, 5);
    const pending = fake.pending;

    view.rerender(<Box tick={1} />);
    view.rerender(<Box tick={2} />);

    expect(fake.pending).toBe(pending);
    runFrames(fake, 80, next);
    expect(box.style.transform).toBe(at(100));
  });

  test("animates a different element the ref moves to", () => {
    const { fake, options } = setup();
    function Box({ id }: { id: string }) {
      const ref = useSpring<HTMLDivElement>({ x: 20 }, options());
      return <div key={id} ref={ref} id={id} />;
    }
    const view = mount(<Box id="a" />);
    runFrames(fake, 80);
    view.rerender(<Box id="b" />);
    runFrames(fake, 80);

    const second = view.container.firstElementChild as HTMLElement;
    expect(second.id).toBe("b");
    expect(second.style.transform).toBe(at(20));
  });

  test("applies the targets when the element appears after the hook's last commit", () => {
    const { fake, options } = setup();
    let show!: () => void;
    // The host never re-renders: only this child does, so the ref callback is the one that has to react.
    function Late({ refCallback }: { refCallback: RefCallback<HTMLDivElement> }) {
      const [visible, setVisible] = useState(false);
      show = () => setVisible(true);
      return visible ? <div ref={refCallback} /> : null;
    }
    function Host() {
      const ref = useSpring<HTMLDivElement>({ x: 30 }, options());
      return <Late refCallback={ref} />;
    }
    const view = mount(<Host />);
    expect(fake.pending).toBe(0);

    act(() => show());
    runFrames(fake, 80);

    expect((view.container.firstElementChild as HTMLElement).style.transform).toBe(at(30));
  });

  test("stops the animation when the component unmounts", () => {
    const { fake, options } = setup();
    function Box() {
      const ref = useSpring<HTMLDivElement>({ x: 100 }, options());
      return <div ref={ref} />;
    }
    const view = mount(<Box />);
    runFrames(fake, 5);
    expect(fake.pending).toBeGreaterThan(0);

    view.unmount();
    runFrames(fake, 2, 200);

    expect(fake.pending).toBe(0);
  });

  test("survives StrictMode's simulated remount and still reaches the targets", () => {
    const { fake, options } = setup();
    function Box() {
      const ref = useSpring<HTMLDivElement>({ x: 100 }, options());
      return <div ref={ref} />;
    }
    const view = mount(
      <StrictMode>
        <Box />
      </StrictMode>,
    );
    runFrames(fake, 80);

    expect((view.container.firstElementChild as HTMLElement).style.transform).toBe(at(100));
  });
});
