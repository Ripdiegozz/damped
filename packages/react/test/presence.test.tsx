import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { Component, StrictMode, act, createRef, type ReactNode, type Ref, type RefCallback } from "react";
import { createSpring, type EnterOptions } from "damped";
import { peekSpringValue } from "../../core/src/animate";
import { IDENTITY, SPRING, parseTransform } from "../../core/test/layout-world";
import { Presence } from "../src";
import { cleanup, createTestScheduler, drain, mount, runFrames, settle } from "./harness";

afterEach(cleanup);

const LENGTH = { restDelta: 0.01, restSpeed: 0.1 };
const RATIO = { restDelta: 0.0005, restSpeed: 0.005 };
const ENTER = { opacity: 0, y: 20 };
const EXIT = { opacity: 0, y: -20 };

function setup() {
  const test = createTestScheduler();
  const options: EnterOptions = { ...SPRING, scheduler: test.scheduler };
  return { ...test, options };
}

const ids = (container: HTMLElement): string[] => Array.from(container.children).map((child) => child.id);
const byId = (container: HTMLElement, id: string) => container.querySelector(`#${id}`) as HTMLDivElement;

/** Counts how often it renders: it re-renders exactly when Presence does. */
function counter(id: string) {
  const state = { renders: 0 };
  function Counted() {
    state.renders++;
    return <div id={id} />;
  }
  return { state, Counted };
}

function tree(keys: string[], props: Partial<Parameters<typeof Presence>[0]> = {}) {
  return (
    <Presence {...props}>
      {keys.map((key) => (
        <div key={key} id={key} />
      ))}
    </Presence>
  );
}

describe("Presence enter", () => {
  test("children present on the first mount do not animate in", () => {
    const { fake, options } = setup();
    const view = mount(tree(["a", "b"], { enter: ENTER, exit: EXIT, options }));

    expect(ids(view.container)).toEqual(["a", "b"]);
    expect(fake.requests).toBe(0);
    expect(byId(view.container, "a").style.transform).toBe("");
  });

  test("with `initial`, children present on the first mount animate in too", async () => {
    const { fake, options } = setup();
    const view = mount(tree(["a"], { enter: ENTER, options, initial: true }));
    const a = byId(view.container, "a");

    fake.flush(0);
    expect(parseTransform(a.style.transform).y).toBe(20);
    expect(a.style.opacity).toBe("0");

    await drain(fake, 16);
    expect(a.style.transform).toBe(IDENTITY);
    expect(a.style.opacity).toBe("1");
  });

  test("a child added later enters from the enter targets and settles on its identity values", async () => {
    const { fake, options } = setup();
    const view = mount(tree(["a"], { enter: ENTER, exit: EXIT, options }));

    view.rerender(tree(["a", "b"], { enter: ENTER, exit: EXIT, options }));
    const b = byId(view.container, "b");
    fake.flush(0);
    expect(parseTransform(b.style.transform).y).toBe(20);
    expect(b.style.opacity).toBe("0");
    fake.flush(80);
    expect(parseTransform(b.style.transform).y).toBe(createSpring(20, 0, 0, { ...SPRING, ...LENGTH }).at(0.08).position);
    expect(b.style.opacity).toBe(String(createSpring(0, 1, 0, { ...SPRING, ...RATIO }).at(0.08).position));

    await drain(fake, 96);
    expect(b.style.transform).toBe(IDENTITY);
    expect(b.style.opacity).toBe("1");
    expect(byId(view.container, "a").style.transform).toBe("");
  });

  test("without enter targets nothing animates", () => {
    const { fake, options } = setup();
    const view = mount(tree(["a"], { options }));

    view.rerender(tree(["a", "b"], { options }));

    expect(fake.requests).toBe(0);
  });

  test("enters once under StrictMode", async () => {
    const { fake, options, log } = setup();
    const wrap = (keys: string[]) => <StrictMode>{tree(keys, { enter: ENTER, exit: EXIT, options })}</StrictMode>;
    const view = mount(wrap(["a"]));
    expect(fake.requests).toBe(0);

    view.rerender(wrap(["a", "b"]));
    const loops = log.length;
    fake.flush(0);
    expect(parseTransform(byId(view.container, "b").style.transform).y).toBe(20);
    await drain(fake, 16);
    expect(byId(view.container, "b").style.transform).toBe(IDENTITY);
    expect(loops).toBe(2);
  });
});

describe("Presence exit", () => {
  test("a removed child stays rendered while it exits, then is dropped with one re-render", async () => {
    const { fake, options } = setup();
    const keep = counter("keep");
    const render = (withB: boolean) => (
      <Presence enter={ENTER} exit={EXIT} options={options}>
        <keep.Counted key="keep" />
        {withB ? <div key="b" id="b" /> : null}
      </Presence>
    );
    const view = mount(render(true));
    const b = byId(view.container, "b");

    view.rerender(render(false));
    const removing = keep.state.renders;
    expect(byId(view.container, "b")).toBe(b);
    expect(b.hasAttribute("inert")).toBe(true);

    fake.flush(0);
    fake.flush(80);
    expect(parseTransform(b.style.transform).y).toBe(createSpring(0, -20, 0, { ...SPRING, ...LENGTH }).at(0.08).position);
    expect(keep.state.renders).toBe(removing);

    let next = 96;
    for (let i = 0; i < 200 && fake.pending > 0; i++, next += 16) fake.flush(next);
    expect(ids(view.container)).toEqual(["keep", "b"]);
    expect(keep.state.renders).toBe(removing);

    await settle();
    expect(ids(view.container)).toEqual(["keep"]);
    expect(keep.state.renders).toBe(removing + 1);
  });

  test("without exit targets a removed child disappears at once", () => {
    const { options } = setup();
    const view = mount(tree(["a", "b"], { enter: ENTER, options }));

    view.rerender(tree(["a"], { enter: ENTER, options }));

    expect(ids(view.container)).toEqual(["a"]);
  });

  test("the same key coming back during its exit interrupts it, keeps the element and its velocity", async () => {
    const { fake, options } = setup();
    const props = { enter: ENTER, exit: EXIT, options };
    const view = mount(tree(["a", "b"], props));
    const b = byId(view.container, "b");
    view.rerender(tree(["a"], props));
    const next = runFrames(fake, 6);
    const value = peekSpringValue(b, "y")!;
    const velocity = value.getVelocity();
    expect(velocity).not.toBe(0);

    view.rerender(tree(["a", "b"], props));

    expect(byId(view.container, "b")).toBe(b);
    expect(value.getVelocity()).toBe(velocity);
    expect(b.hasAttribute("inert")).toBe(false);

    await drain(fake, next);
    expect(byId(view.container, "b")).toBe(b);
    expect(ids(view.container)).toEqual(["a", "b"]);
    expect(b.style.transform).toBe(IDENTITY);
    expect(b.style.opacity).toBe("1");
  });

  test("a key can leave, return and leave again", async () => {
    const { fake, options } = setup();
    const props = { enter: ENTER, exit: EXIT, options };
    const view = mount(tree(["a", "b"], props));
    view.rerender(tree(["a"], props));
    const next = runFrames(fake, 4);
    view.rerender(tree(["a", "b"], props));
    const later = runFrames(fake, 4, next);

    view.rerender(tree(["a"], props));
    // The first, interrupted exit reports `false` now; that must not drop the child that is exiting again.
    await settle();
    expect(ids(view.container)).toEqual(["a", "b"]);
    await drain(fake, later);

    expect(ids(view.container)).toEqual(["a"]);
  });

  test("exiting children keep their position among the remaining ones", async () => {
    const { fake, options } = setup();
    const props = { enter: ENTER, exit: EXIT, options };
    const view = mount(tree(["a", "b", "c"], props));

    view.rerender(tree(["a", "c"], props));
    expect(ids(view.container)).toEqual(["a", "b", "c"]);

    view.rerender(tree(["c"], props));
    expect(ids(view.container)).toEqual(["a", "b", "c"]);

    view.rerender(tree(["c", "d"], props));
    expect(ids(view.container)).toEqual(["a", "b", "c", "d"]);

    view.rerender(tree(["d", "c"], props));
    expect(ids(view.container).filter((id) => id === "a" || id === "b")).toEqual(["a", "b"]);

    await drain(fake, 0);
    expect(ids(view.container)).toEqual(["d", "c"]);
  });

  test("an exiting child that cannot take a ref is dropped at once instead of hanging", () => {
    const { fake, options } = setup();
    function Plain() {
      return <div id="plain" />;
    }
    const render = (show: boolean) => <Presence exit={EXIT} options={options}>{show ? <Plain key="plain" /> : null}</Presence>;
    const view = mount(render(true));

    view.rerender(render(false));

    expect(ids(view.container)).toEqual([]);
    expect(fake.requests).toBe(0);
  });

  test("does not re-render across animation frames", async () => {
    const { fake, options } = setup();
    const props = { enter: ENTER, exit: EXIT, options };
    const keep = counter("keep");
    const render = (keys: string[]) => (
      <Presence {...props}>
        <keep.Counted key="keep" />
        {keys.map((key) => (
          <div key={key} id={key} />
        ))}
      </Presence>
    );
    const view = mount(render(["a"]));
    view.rerender(render(["a", "b"]));
    const entering = keep.state.renders;

    const next = runFrames(fake, 30);
    expect(fake.pending).toBeGreaterThan(0);
    expect(keep.state.renders).toBe(entering);

    for (let i = 0, t = next; i < 200 && fake.pending > 0; i++, t += 16) fake.flush(t);
    expect(keep.state.renders).toBe(entering);
    await settle();
  });
});

describe("Presence refs", () => {
  test("a user ref callback on a host child still receives the element, and null when it unmounts", () => {
    const { options } = setup();
    const received: (Element | null)[] = [];
    const ref: RefCallback<HTMLDivElement> = (node) => {
      received.push(node);
    };
    const render = (show: boolean) => <Presence options={options}>{show ? <div key="a" id="a" ref={ref} /> : null}</Presence>;
    const view = mount(render(true));

    expect(received).toEqual([byId(view.container, "a")]);
    view.rerender(render(false));
    expect(received.at(-1)).toBeNull();
  });

  test("a user ref callback that returns a cleanup function has it called", () => {
    const { options } = setup();
    let cleaned = 0;
    const ref: RefCallback<HTMLDivElement> = () => () => {
      cleaned++;
    };
    const render = (show: boolean) => <Presence options={options}>{show ? <div key="a" ref={ref} /> : null}</Presence>;
    const view = mount(render(true));

    view.rerender(render(false));

    expect(cleaned).toBe(1);
  });

  test("a user ref object receives the element", () => {
    const { options } = setup();
    const ref = createRef<HTMLDivElement>();
    const view = mount(
      <Presence options={options}>
        <div key="a" id="a" ref={ref} />
      </Presence>,
    );

    expect(ref.current).toBe(byId(view.container, "a"));
  });

  test("a component that takes `ref` as a prop is animated and its own ref is kept", async () => {
    const { fake, options } = setup();
    const own = createRef<HTMLDivElement>();
    function Card({ ref, label }: { ref?: Ref<HTMLDivElement>; label: string }) {
      return <div id="card" ref={ref}>{label}</div>;
    }
    const render = (show: boolean) => (
      <Presence enter={ENTER} exit={EXIT} options={options}>
        {show ? <Card key="card" ref={own} label="hi" /> : null}
      </Presence>
    );
    const view = mount(render(false));
    view.rerender(render(true));

    expect(own.current).toBe(byId(view.container, "card"));
    fake.flush(0);
    expect(parseTransform(own.current!.style.transform).y).toBe(20);

    view.rerender(render(false));
    expect(byId(view.container, "card")).toBe(own.current!);
    await drain(fake, 16);
    expect(ids(view.container)).toEqual([]);
  });

  test("swapping the user ref moves the element to the new one", () => {
    const { options } = setup();
    const first = createRef<HTMLDivElement>();
    const second = createRef<HTMLDivElement>();
    const render = (ref: Ref<HTMLDivElement>) => (
      <Presence options={options}>
        <div key="a" id="a" ref={ref} />
      </Presence>
    );
    const view = mount(render(first));

    view.rerender(render(second));

    expect(first.current).toBeNull();
    expect(second.current).toBe(byId(view.container, "a"));
  });

  test("a child that stays rendered is not re-attached when Presence re-renders", () => {
    const { options } = setup();
    let attached = 0;
    const ref: RefCallback<HTMLDivElement> = () => {
      attached++;
    };
    const render = (keys: string[]) => (
      <Presence options={options}>
        <div key="a" ref={ref} />
        {keys.map((key) => (
          <div key={key} />
        ))}
      </Presence>
    );
    const view = mount(render([]));

    view.rerender(render(["b"]));
    view.rerender(render([]));

    expect(attached).toBe(1);
  });
});

describe("Presence keys", () => {
  class Boundary extends Component<{ children: ReactNode; onError: (error: Error) => void }, { failed: boolean }> {
    override state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    override componentDidCatch(error: Error) {
      this.props.onError(error);
    }
    override render() {
      return this.state.failed ? null : this.props.children;
    }
  }

  function render(children: ReactNode): Error | undefined {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    let caught: Error | undefined;
    try {
      mount(<Boundary onError={(error) => (caught = error)}><Presence>{children}</Presence></Boundary>);
    } finally {
      spy.mockRestore();
    }
    return caught;
  }

  test("an element child without a key throws a clear error", () => {
    const error = render(<div />);

    expect(error?.message).toMatch(/<Presence> children need a unique `key`/);
  });

  test("a keyless element inside an array throws as well", () => {
    const error = render([<div key="a" />, <span />]);

    expect(error?.message).toMatch(/<Presence> children need a unique `key`/);
  });

  test("two children with the same key throw an error naming the key", () => {
    const error = render([<div key="a" />, <div key="b" />, <div key="a" />]);

    expect(error).toBeInstanceOf(TypeError);
    expect(error?.message).toMatch(/<Presence> children need a unique `key`.*"a"/);
  });

  test("text children throw because they cannot be animated", () => {
    const error = render("hello");

    expect(error?.message).toMatch(/<Presence> children must be elements/);
  });

  test("null, false and undefined children are ignored", () => {
    const { options } = setup();
    const view = mount(
      <Presence options={options}>
        {null}
        {false}
        {undefined}
        <div key="a" id="a" />
      </Presence>,
    );

    expect(ids(view.container)).toEqual(["a"]);
  });
});
