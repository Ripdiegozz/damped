import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SpringInstrument } from "../src/components/landing/SpringInstrument";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom has no layout. The instrument reads the width of its rail, so the test gives every element one.
const RAIL_PX = 400;
const proto = HTMLElement.prototype as unknown as { clientWidth: number };
const originalWidth = Object.getOwnPropertyDescriptor(proto, "clientWidth");
const originalRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => RAIL_PX });
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: RAIL_PX, bottom: 100, width: RAIL_PX, height: 100, x: 0, y: 0, toJSON: () => ({}) };
  };
});

const mounted: { root: Root; container: HTMLElement }[] = [];
const originalMatchMedia = globalThis.matchMedia;

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  if (originalWidth) Object.defineProperty(proto, "clientWidth", originalWidth);
  else delete (proto as { clientWidth?: number }).clientWidth;
  Element.prototype.getBoundingClientRect = originalRect;
  globalThis.matchMedia = originalMatchMedia;
});

function mount(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(<SpringInstrument />));
  return container;
}

function preferReducedMotion(): void {
  globalThis.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof matchMedia;
}

const sleep = (ms: number) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
const until = (condition: () => boolean, timeoutMs = 6000) =>
  act(async () => {
    const begin = performance.now();
    while (!condition()) {
      if (performance.now() - begin > timeoutMs) throw new Error("timed out waiting for the condition");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });

const root = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-demo]")!;
const slider = (container: HTMLElement) => container.querySelector<HTMLElement>('[role="slider"]')!;
const mass = (container: HTMLElement) => container.querySelector<HTMLElement>(".instrument__mass")!;
const readout = (container: HTMLElement, name: string) => container.querySelector<HTMLElement>(`[data-readout="${name}"]`)!;
const key = (container: HTMLElement, name: string) => act(() => void slider(container).dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })));
const button = (container: HTMLElement, name: string) => [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name)!;
const offsetOf = (element: HTMLElement): number => Number(/translate3d\((-?[\d.]+)px/.exec(element.style.transform)?.[1] ?? "0");

function pointer(target: Element, type: string, clientX: number, timeStamp: number): void {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 0, pointerId: 1, buttons: type === "pointerup" ? 0 : 1 });
  Object.defineProperty(event, "timeStamp", { value: timeStamp });
  act(() => void target.dispatchEvent(event));
}

describe("the test-hook contract", () => {
  test("is a labelled group named spring-instrument that starts idle with zero runs", () => {
    const container = mount();
    expect(root(container).dataset.demo).toBe("spring-instrument");
    expect(root(container).dataset.state).toBe("idle");
    expect(root(container).dataset.runs).toBe("0");
    expect(root(container).getAttribute("role")).toBe("group");
    expect(root(container).getAttribute("aria-label") ?? root(container).getAttribute("aria-labelledby")).toBeTruthy();
  });
});

describe("accessibility", () => {
  test("the rail is a focusable slider with a name, a description and a live status", () => {
    const container = mount();
    const track = slider(container);
    expect(track.tabIndex).toBe(0);
    expect(track.getAttribute("aria-label")).toBeTruthy();
    expect(track.getAttribute("aria-valuemin")).toBe("0");
    expect(track.getAttribute("aria-valuemax")).toBe("100");
    expect(track.getAttribute("aria-valuenow")).toBe("50");
    const described = container.querySelector(`#${CSS.escape(track.getAttribute("aria-describedby") ?? "none")}`);
    expect(described?.textContent).toMatch(/drag/i);
    expect(described?.textContent).toMatch(/arrow/i);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  test("announces where the mass came to rest once, when it settles", async () => {
    const container = mount();
    key(container, "End");
    const status = container.querySelector('[role="status"]')!;
    await until(() => root(container).dataset.state === "settled");
    expect(status.textContent).toContain("100");
  });
});

describe("keyboard", () => {
  test("arrow keys, Home and End retarget the rest point and report it", () => {
    const container = mount();
    key(container, "ArrowRight");
    expect(slider(container).getAttribute("aria-valuenow")).toBe("60");
    expect(root(container).dataset.runs).toBe("1");
    key(container, "End");
    expect(slider(container).getAttribute("aria-valuenow")).toBe("100");
    key(container, "Home");
    expect(slider(container).getAttribute("aria-valuenow")).toBe("0");
    key(container, "ArrowLeft");
    expect(slider(container).getAttribute("aria-valuenow")).toBe("0");
    expect(root(container).dataset.state).toBe("animating");
  });

  test("a key pressed while the mass moves retargets it, counts a run and still settles", async () => {
    const container = mount();
    key(container, "End");
    expect(root(container).dataset.state).toBe("animating");
    key(container, "Home");
    expect(root(container).dataset.runs).toBe("2");
    await until(() => root(container).dataset.state === "settled");
    expect(root(container).dataset.runs).toBe("2");
    expect(offsetOf(mass(container))).toBeCloseTo(-RAIL_PX / 2, 6);
  });

  test("ignores keys it does not handle", () => {
    const container = mount();
    key(container, "a");
    expect(root(container).dataset.runs).toBe("0");
    expect(root(container).dataset.state).toBe("idle");
  });
});

describe("readouts and traces", () => {
  test("write position, velocity and damping ratio to the DOM as the mass moves", async () => {
    const container = mount();
    expect(readout(container, "x").textContent).toBe("+0.0 px");
    expect(readout(container, "v").textContent).toBe("0 px/s");
    expect(readout(container, "zeta").textContent).toMatch(/^0\.\d\d$/);
    key(container, "End");
    await until(() => readout(container, "v").textContent !== "0 px/s");
    await until(() => root(container).dataset.state === "settled");
    expect(readout(container, "x").textContent).toBe("+0.0 px");
    expect(readout(container, "v").textContent).toBe("0 px/s");
  });

  test("draw the position trail and the phase portrait while it moves, and the portrait ends at the rest dot", async () => {
    const container = mount();
    key(container, "End");
    await until(() => (container.querySelector(".instrument__phase-path")?.getAttribute("d") ?? "").length > 10);
    expect(container.querySelector(".instrument__trail-path")?.getAttribute("d") ?? "").toMatch(/^M/);
    await until(() => root(container).dataset.state === "settled");
    const head = container.querySelector(".instrument__phase-head")!;
    // The portrait is a 100 unit square with the rest point at its centre.
    expect(Number(head.getAttribute("cx"))).toBeCloseTo(50, 6);
    expect(Number(head.getAttribute("cy"))).toBeCloseTo(50, 6);
  });
});

describe("pointer", () => {
  test("a press on the empty rail moves the rest point there and the mass follows", async () => {
    const container = mount();
    pointer(slider(container), "pointerdown", RAIL_PX * 0.8, 1000);
    expect(slider(container).getAttribute("aria-valuenow")).toBe("80");
    expect(root(container).dataset.runs).toBe("1");
    await until(() => root(container).dataset.state === "settled");
    expect(offsetOf(mass(container))).toBeCloseTo(RAIL_PX * 0.3, 6);
  });

  test("dragging the mass follows the pointer, and releasing springs back to the rest point", async () => {
    const container = mount();
    pointer(mass(container), "pointerdown", 200, 1000);
    expect(root(container).dataset.state).toBe("animating");
    pointer(slider(container), "pointermove", 320, 1040);
    expect(offsetOf(mass(container))).toBeCloseTo(120, 6);
    // Held still for a while before the release: no velocity to carry.
    pointer(slider(container), "pointerup", 320, 1400);
    expect(slider(container).getAttribute("aria-valuenow")).toBe("50");
    await until(() => root(container).dataset.state === "settled");
    expect(offsetOf(mass(container))).toBeCloseTo(0, 6);
  });

  test("the release velocity is carried: a flick away from the rest point overshoots the release point, a still release does not", async () => {
    const peak = async (flick: boolean): Promise<number> => {
      const container = mount();
      pointer(mass(container), "pointerdown", 200, 1000);
      pointer(slider(container), "pointermove", 280, 1020);
      pointer(slider(container), "pointermove", 320, 1040);
      if (flick) pointer(slider(container), "pointermove", 360, 1060);
      const released = flick ? 360 : 320;
      pointer(slider(container), "pointerup", released, flick ? 1062 : 1500);
      let highest = offsetOf(mass(container));
      const start = highest;
      const timer = setInterval(() => void (highest = Math.max(highest, offsetOf(mass(container)))), 5);
      await until(() => root(container).dataset.state === "settled");
      clearInterval(timer);
      return highest - start;
    };
    expect(await peak(true)).toBeGreaterThan(8);
    expect(await peak(false)).toBeLessThan(0.5);
  });

  test("moving the pointer without pressing does nothing", () => {
    const container = mount();
    pointer(slider(container), "pointermove", 300, 1010);
    expect(root(container).dataset.runs).toBe("0");
  });
});

describe("reduced motion", () => {
  test("offers Play anyway, jumps to each rest point and keeps the contract", async () => {
    preferReducedMotion();
    const container = mount();
    await sleep(5);
    expect(container.querySelector('[role="note"]')?.textContent).toMatch(/reduced motion is on/i);
    key(container, "End");
    expect(root(container).dataset.runs).toBe("1");
    expect(offsetOf(mass(container))).toBeCloseTo(RAIL_PX / 2, 6);
    await sleep(5);
    expect(root(container).dataset.state).toBe("settled");
    expect(readout(container, "v").textContent).toBe("0 px/s");
  });

  test("Play anyway brings the spring back", async () => {
    preferReducedMotion();
    const container = mount();
    await sleep(5);
    act(() => button(container, "Play anyway").click());
    expect(button(container, "Stop playing anyway").getAttribute("aria-pressed")).toBe("true");
    key(container, "End");
    expect(root(container).dataset.state).toBe("animating");
    expect(offsetOf(mass(container))).toBeLessThan(RAIL_PX / 2);
    await until(() => root(container).dataset.state === "settled");
  });

  test("shows no note when the system does not ask for it", async () => {
    const container = mount();
    await sleep(5);
    expect(container.querySelector('[role="note"]')).toBeNull();
  });
});
