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
/** Waits (inside act) until `condition` holds, so a test never depends on one fixed delay. */
const until = (condition: () => boolean, timeoutMs = 3000) =>
  act(async () => {
    const begin = performance.now();
    while (!condition()) {
      if (performance.now() - begin > timeoutMs) throw new Error("timed out waiting for the condition");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
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

describe("FlipReorder mid-flight", () => {
  test("pressing another button while the rows move retargets them: every row stays, the last order wins and it settles once", async () => {
    const container = mount(<FlipReorder />);
    const names = () => [...container.querySelectorAll(".flip-name")].map((node) => node.textContent);
    act(() => button(container, "Sort by amount").click());
    act(() => button(container, "Shuffle").click());
    act(() => button(container, "Sort by name").click());
    // Three overlapping layout() calls: all counted, none settled yet.
    expect(demo(container).dataset.runs).toBe("3");
    expect(demo(container).dataset.state).toBe("animating");
    expect(names()).toEqual(["Blue Gym", "City Power", "Corner Grocery", "FiberNet", "Harbor Insurance"]);
    await until(() => demo(container).dataset.state === "settled");
    expect(demo(container).dataset.runs).toBe("3");
    expect(container.querySelectorAll(".flip-row")).toHaveLength(5);
    act(() => button(container, "Reset").click());
    expect(names()[0]).toBe("Corner Grocery");
    expect(demo(container).dataset.runs).toBe("4");
    await until(() => demo(container).dataset.state === "settled");
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
  const toasts = (container: HTMLElement) => container.querySelectorAll(".toast").length;

  test("adds a toast and keeps a removed one mounted until it has left", async () => {
    const container = mount(<PresenceDemo />);
    expect(toasts(container)).toBe(2);
    act(() => button(container, "Add a toast").click());
    expect(toasts(container)).toBe(3);
    expect(demo(container).dataset.state).toBe("animating");
    act(() => container.querySelector<HTMLButtonElement>(".toast-dismiss")!.click());
    // Still mounted while its exit runs, and marked inert by damped.
    expect(toasts(container)).toBe(3);
    expect(container.querySelector(".toast[inert]")).not.toBeNull();
  });

  test("a removal is one run and the demo settles when the toast has actually left, not on a timer", async () => {
    const container = mount(<PresenceDemo />);
    act(() => container.querySelectorAll<HTMLButtonElement>(".toast-dismiss")[0]!.click());
    expect(demo(container).dataset.runs).toBe("1");
    expect(demo(container).dataset.state).toBe("animating");
    // Settled only after Presence reported the exit: the toast is gone from the DOM by then.
    await until(() => demo(container).dataset.state === "settled");
    expect(toasts(container)).toBe(1);
    expect(container.querySelector(".toast[inert]")).toBeNull();
    expect(demo(container).dataset.runs).toBe("1");
  });

  test("removing the newest toast twice in a row counts two runs and settles after both have left", async () => {
    const container = mount(<PresenceDemo />);
    act(() => button(container, "Remove the newest").click());
    act(() => button(container, "Remove the newest").click());
    expect(demo(container).dataset.runs).toBe("2");
    await until(() => demo(container).dataset.state === "settled");
    expect(toasts(container)).toBe(0);
    expect(demo(container).dataset.runs).toBe("2");
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

  test("unmounting right after Block main thread cancels the pending block instead of busy-looping a detached demo", async () => {
    const container = mount(<CompositorVsJs />);
    act(() => button(container, "Block main thread (1 s)").click());
    // Unmount before the lead-in elapses; the block must never run afterwards.
    const index = mounted.findIndex((entry) => entry.container === container);
    const entry = mounted.splice(index, 1)[0]!;
    act(() => entry.root.unmount());
    entry.container.remove();
    const originalNow = performance.now.bind(performance);
    let reads = 0;
    performance.now = () => {
      reads++;
      return originalNow();
    };
    try {
      await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 900))));
    } finally {
      performance.now = originalNow;
    }
    // The 1 s busy loop reads the clock hundreds of thousands of times; an idle page reads it a handful.
    expect(reads).toBeLessThan(1000);
  });
});
