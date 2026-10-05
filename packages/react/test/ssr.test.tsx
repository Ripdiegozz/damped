import { afterEach, describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { Presence, useLayout, useMorph, useSpring, useSpringValue } from "../src";
import { cleanup } from "./harness";

afterEach(cleanup);

// Replaces the DOM globals with traps for the duration of `render`, the way a server has none at all.
function withoutDom(render: () => string): { html: string; touched: string[] } {
  const touched: string[] = [];
  const names = ["window", "document", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "getComputedStyle"] as const;
  const saved = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const name of names) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        touched.push(name);
        return undefined;
      },
    });
  }
  try {
    return { html: render(), touched };
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[name];
      else Object.defineProperty(globalThis, name, descriptor);
    }
  }
}

describe("server rendering", () => {
  test("useSpringValue renders without touching the DOM", () => {
    function Probe() {
      const value = useSpringValue(4);
      return <span>{value.get()}</span>;
    }
    const { html, touched } = withoutDom(() => renderToString(<Probe />));

    expect(html).toContain("4");
    expect(touched).toEqual([]);
  });

  test("useSpring renders without touching the DOM", () => {
    function Probe() {
      const ref = useSpring<HTMLDivElement>({ x: 10, opacity: 0.5 });
      return <div ref={ref}>spring</div>;
    }
    const { html, touched } = withoutDom(() => renderToString(<Probe />));

    expect(html).toBe("<div>spring</div>");
    expect(touched).toEqual([]);
  });

  test("useLayout renders without touching the DOM", () => {
    function Probe() {
      const ref = useLayout<HTMLDivElement>([1, "a"]);
      return <div ref={ref}>layout</div>;
    }
    const { html, touched } = withoutDom(() => renderToString(<Probe />));

    expect(html).toBe("<div>layout</div>");
    expect(touched).toEqual([]);
  });

  test("useMorph renders closed without touching the DOM", () => {
    function Probe() {
      const { source, target, isOpen } = useMorph();
      return (
        <div>
          <span ref={source}>{String(isOpen)}</span>
          <p ref={target}>target</p>
        </div>
      );
    }
    const { html, touched } = withoutDom(() => renderToString(<Probe />));

    expect(html).toBe("<div><span>false</span><p>target</p></div>");
    expect(touched).toEqual([]);
  });

  test("Presence renders its children without touching the DOM", () => {
    const { html, touched } = withoutDom(() =>
      renderToString(
        <Presence enter={{ opacity: 0 }} exit={{ opacity: 0 }} initial>
          <div key="a">a</div>
          <div key="b">b</div>
        </Presence>,
      ),
    );

    expect(html).toBe("<div>a</div><div>b</div>");
    expect(touched).toEqual([]);
  });
});
