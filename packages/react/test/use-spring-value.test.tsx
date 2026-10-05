import { afterEach, describe, expect, test } from "bun:test";
import { StrictMode } from "react";
import type { SpringValue } from "damped";
import { useSpringValue } from "../src";
import { cleanup, createTestScheduler, mount, runFrames } from "./harness";

afterEach(cleanup);

describe("useSpringValue", () => {
  test("creates one value, returned unchanged by every render", () => {
    const { scheduler } = createTestScheduler();
    const seen: SpringValue[] = [];
    function Probe({ initial }: { initial: number }) {
      seen.push(useSpringValue(initial, { scheduler }));
      return null;
    }
    const view = mount(<Probe initial={3} />);
    view.rerender(<Probe initial={99} />);
    view.rerender(<Probe initial={7} />);

    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]!.get()).toBe(3);
  });

  test("drives the value through the given scheduler", () => {
    const { fake, scheduler } = createTestScheduler();
    let value!: SpringValue;
    function Probe() {
      value = useSpringValue(0, { scheduler });
      return null;
    }
    mount(<Probe />);

    const settled = value.set(10, { duration: 0.3, bounce: 0 });
    runFrames(fake, 60);

    expect(value.get()).toBe(10);
    expect(value.animating).toBe(false);
    return expect(settled).resolves.toBe(true);
  });

  test("unmounting stops the animation with zero velocity", async () => {
    const { fake, scheduler } = createTestScheduler();
    let value!: SpringValue;
    function Probe() {
      value = useSpringValue(0, { scheduler });
      return null;
    }
    const view = mount(<Probe />);
    const pending = value.set(100, { duration: 0.5, bounce: 0 });
    runFrames(fake, 5);
    expect(value.getVelocity()).not.toBe(0);

    view.unmount();

    expect(value.animating).toBe(false);
    expect(value.getVelocity()).toBe(0);
    expect(await pending).toBe(false);
    expect(fake.pending).toBe(0);
  });

  test("unmounting drops the listeners", () => {
    const { scheduler } = createTestScheduler();
    let value!: SpringValue;
    function Probe() {
      value = useSpringValue(0, { scheduler });
      return null;
    }
    const view = mount(<Probe />);
    const calls: number[] = [];
    value.onChange((next) => calls.push(next));
    value.jump(1);
    expect(calls).toEqual([1]);

    view.unmount();
    value.jump(2);

    expect(calls).toEqual([1]);
  });

  test("listeners subscribed after a StrictMode mount still fire", () => {
    const { scheduler } = createTestScheduler();
    let value!: SpringValue;
    const calls: number[] = [];
    function Probe() {
      value = useSpringValue(0, { scheduler });
      return null;
    }
    mount(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    value.onChange((next) => calls.push(next));
    value.jump(5);

    expect(calls).toEqual([5]);
  });

  test("does not re-render while the value animates", () => {
    const { fake, scheduler } = createTestScheduler();
    let renders = 0;
    let value!: SpringValue;
    function Probe() {
      renders++;
      value = useSpringValue(0, { scheduler });
      return <div />;
    }
    mount(<Probe />);
    const before = renders;

    value.onChange(() => {});
    void value.set(100, { duration: 0.5, bounce: 0.2 });
    runFrames(fake, 40);

    expect(value.animating).toBe(true);
    expect(renders).toBe(before);
  });
});
