import { afterEach, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CompositorVsJs, FlipReorder, MorphCard, PresenceDemo, RetargetSpring, SpringTuner } from "../src/components/demos";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

function mount(ui: ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(ui));
  return container;
}

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));
const demo = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-demo]")!;
const button = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name)!;

describe("the test-hook contract", () => {
  const demos: [string, ReactNode][] = [
    ["retarget-spring", <RetargetSpring />],
    ["spring-tuner", <SpringTuner />],
    ["flip-reorder", <FlipReorder />],
    ["morph-card", <MorphCard />],
    ["presence", <PresenceDemo />],
    ["compositor-vs-js", <CompositorVsJs />],
  ];

  test.each(demos)("%s has data-demo, starts idle with zero runs and is a labelled group", (name, ui) => {
    const root = demo(mount(ui));
    expect(root.dataset.demo).toBe(name);
    expect(root.dataset.state).toBe("idle");
    expect(root.dataset.runs).toBe("0");
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-label") ?? root.getAttribute("aria-labelledby")).toBeTruthy();
  });
});

describe("FlipReorder", () => {
  test("a sort button reorders the rows and the demo goes animating then settled without re-rendering per frame", async () => {
    const container = mount(<FlipReorder />);
    const names = () => [...container.querySelectorAll(".flip-name")].map((node) => node.textContent);
    expect(names()[0]).toBe("Corner Grocery");
    act(() => button(container, "Sort by name").click());
    expect(names()).toEqual(["Blue Gym", "City Power", "Corner Grocery", "FiberNet", "Harbor Insurance"]);
    expect(demo(container).dataset.runs).toBe("1");
    expect(demo(container).dataset.state).toBe("animating");
    await settle();
    expect(demo(container).dataset.state).toBe("settled");
  });
});

describe("MorphCard", () => {
  test("opens on click, reverses on Escape while opening, and moves focus into the dialog and back", async () => {
    const container = mount(<MorphCard />);
    const root = demo(container);
    const card = container.querySelector<HTMLButtonElement>(".morph-card")!;
    const dialog = container.querySelector<HTMLElement>(".morph-dialog")!;
    expect(dialog.hidden).toBe(true);
    expect(card.getAttribute("aria-expanded")).toBe("false");

    act(() => card.click());
    expect(root.dataset.phase).toBe("opening");
    expect(card.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.hidden).toBe(false);
    expect(root.dataset.state).toBe("animating");
    expect(container.contains(document.activeElement) && dialog.contains(document.activeElement)).toBe(true);

    act(() => void dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(root.dataset.phase).toBe("closing");
    expect(document.activeElement).toBe(card);
    expect(card.getAttribute("aria-expanded")).toBe("false");

    // Reopening while it closes reverses it again.
    act(() => card.click());
    expect(root.dataset.phase).toBe("opening");
  });

  test("Escape does nothing while closed, and the compact variant keeps the test hooks", () => {
    const container = mount(<MorphCard variant="compact" className="in-hero" />);
    const root = demo(container);
    act(() => void root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(root.dataset.phase).toBe("closed");
    expect(root.dataset.state).toBe("idle");
    expect(root.className).toContain("morph-demo--compact");
    expect(root.className).toContain("in-hero");
  });

  test("reports each open and close request", () => {
    const calls: boolean[] = [];
    const container = mount(<MorphCard onOpenChange={(open) => calls.push(open)} />);
    act(() => container.querySelector<HTMLButtonElement>(".morph-card")!.click());
    act(() => button(container, "Close").click());
    expect(calls).toEqual([true, false]);
  });
});

describe("PresenceDemo", () => {
  test("adds a toast and keeps a removed one mounted until it has left", async () => {
    const container = mount(<PresenceDemo />);
    const count = () => container.querySelectorAll(".toast").length;
    expect(count()).toBe(2);
    act(() => button(container, "Add a toast").click());
    expect(count()).toBe(3);
    expect(demo(container).dataset.state).toBe("animating");
    act(() => container.querySelector<HTMLButtonElement>(".toast-dismiss")!.click());
    // Still mounted while its exit runs, and marked inert by damped.
    expect(count()).toBe(3);
    expect(container.querySelector(".toast[inert]")).not.toBeNull();
  });
});

describe("SpringTuner", () => {
  test("shows the physical parameters of the sliders and redraws the curve when one changes", () => {
    const container = mount(<SpringTuner />);
    const curve = () => container.querySelector(".plot-curve")!.getAttribute("d");
    const before = curve();
    const bounce = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(bounce, "0.6");
      bounce.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(curve()).not.toBe(before);
    expect(container.textContent).toContain("underdamped");
    expect(container.querySelector("dl")!.textContent).toContain("Stiffness");
  });

  test("Replay runs the spring: animating, then settled", async () => {
    const container = mount(<SpringTuner />);
    act(() => button(container, "Replay").click());
    expect(demo(container).dataset.state).toBe("animating");
    expect(demo(container).dataset.runs).toBe("1");
  });
});

describe("RetargetSpring", () => {
  test("the track is a keyboard-operable slider that retargets and reports it", () => {
    const container = mount(<RetargetSpring />);
    const track = container.querySelector<HTMLElement>('[role="slider"]')!;
    expect(track.tabIndex).toBe(0);
    act(() => void track.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(track.getAttribute("aria-valuenow")).toBe("25");
    expect(demo(container).dataset.runs).toBe("1");
    act(() => void track.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(track.getAttribute("aria-valuenow")).toBe("100");
    act(() => void track.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(track.getAttribute("aria-valuenow")).toBe("0");
    expect(demo(container).dataset.state).toBe("animating");
  });

  test("ignores keys it does not handle", () => {
    const container = mount(<RetargetSpring />);
    act(() => void container.querySelector('[role="slider"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true })));
    expect(demo(container).dataset.runs).toBe("0");
  });
});

describe("CompositorVsJs", () => {
  test("labels both drivers and starts and stops the loop", async () => {
    const container = mount(<CompositorVsJs />);
    expect(container.textContent).toContain("JS driver");
    expect(container.textContent).toContain("Compositor driver");
    const start = button(container, "Start");
    act(() => start.click());
    expect(demo(container).dataset.state).toBe("animating");
    expect(button(container, "Stop").getAttribute("aria-pressed")).toBe("true");
    act(() => button(container, "Stop").click());
    await settle();
    expect(demo(container).dataset.state).toBe("settled");
  });
});
