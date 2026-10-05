import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DampingRatio, Interruption, MassOnSpring, PhasePortrait } from "../src/components/physics";

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

const realMatchMedia = globalThis.matchMedia;

function reduceMotion(reduce: boolean): void {
  (globalThis as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

beforeEach(() => reduceMotion(false));

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  (globalThis as { matchMedia: unknown }).matchMedia = realMatchMedia;
});

const settle = (ms = 30) => act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
const until = (condition: () => boolean, timeoutMs = 8000) =>
  act(async () => {
    const begin = performance.now();
    while (!condition()) {
      if (performance.now() - begin > timeoutMs) throw new Error("timed out waiting for the condition");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });

const demo = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-demo]")!;
const text = (container: HTMLElement, name: string) => container.querySelector(`[data-readout="${name}"]`)!.textContent!;
const button = (container: HTMLElement, name: string | RegExp) =>
  [...container.querySelectorAll("button")].find((candidate) => (typeof name === "string" ? candidate.textContent?.trim() === name : name.test(candidate.textContent ?? "")))!;
const key = (target: Element, name: string) => act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })));
const number = (value: string): number => Number(value.replace("−", "-").replace(/[^\d.+-]/g, ""));

/** Pointer events as React sees them: `clientX` and `clientY` on a mouse event of the pointer type. */
const pointer = (target: Element, type: "pointerdown" | "pointermove" | "pointerup", x: number, y = 0, buttons = 1) =>
  act(() => void target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, buttons })));

/** happy-dom lays nothing out: give an element the box a browser would, one client pixel per SVG unit. */
function box(element: Element, width: number, height: number): void {
  element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect;
}

describe("the test-hook contract", () => {
  const figures: [string, ReactNode][] = [
    ["physics-mass", <MassOnSpring />],
    ["physics-damping", <DampingRatio />],
    ["physics-phase", <PhasePortrait />],
    ["physics-interruption", <Interruption />],
  ];

  test.each(figures)("%s has data-demo, starts idle with zero runs, and is a labelled group with a live description", (name, ui) => {
    const container = mount(ui);
    const root = demo(container);
    expect(root.dataset.demo).toBe(name);
    expect(root.dataset.state).toBe("idle");
    expect(root.dataset.runs).toBe("0");
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-labelledby") ?? root.getAttribute("aria-label")).toBeTruthy();
    const live = root.querySelector("[aria-live]");
    expect(live?.getAttribute("aria-live")).toBe("polite");
    expect(live?.textContent?.length).toBeGreaterThan(10);
  });

  test.each(figures)("%s keeps the contract attributes out of React: a render does not reset them", async (_, ui) => {
    const container = mount(ui);
    const root = demo(container);
    root.dataset.runs = "7";
    await settle();
    expect(root.dataset.runs).toBe("7");
  });
});

describe("MassOnSpring", () => {
  const slider = (container: HTMLElement) => container.querySelector<HTMLElement>('[role="slider"]')!;

  test("the mass is a focusable slider with a name and a value text", () => {
    const container = mount(<MassOnSpring />);
    const mass = slider(container);
    expect(mass.getAttribute("tabindex")).toBe("0");
    expect(mass.getAttribute("aria-label")).toMatch(/mass/i);
    expect(mass.getAttribute("aria-valuenow")).toBe("0");
    expect(mass.getAttribute("aria-valuetext")).toMatch(/rest/i);
  });

  test("arrow keys displace the mass, Enter releases it, and it settles back on the rest position", async () => {
    const container = mount(<MassOnSpring />);
    const mass = slider(container);
    key(mass, "ArrowRight");
    key(mass, "ArrowRight");
    key(mass, "ArrowRight");
    expect(mass.getAttribute("aria-valuenow")).toBe("36");
    expect(number(text(container, "position"))).toBe(36);
    expect(demo(container).dataset.runs).toBe("0");
    expect(demo(container).dataset.state).toBe("idle");
    // The coil follows the mass.
    expect(container.querySelector(".physics-coil")!.getAttribute("d")).toMatch(/^M/);

    key(mass, "Enter");
    expect(demo(container).dataset.runs).toBe("1");
    expect(demo(container).dataset.state).toBe("animating");
    await until(() => demo(container).dataset.state === "settled");
    expect(number(text(container, "position"))).toBe(0);
    expect(number(text(container, "velocity"))).toBe(0);
    expect(mass.getAttribute("aria-valuenow")).toBe("0");
    expect(demo(container).dataset.runs).toBe("1");
  });

  test("grabbing it mid-flight stops it where it is, and releasing continues from that state", async () => {
    const container = mount(<MassOnSpring />);
    const mass = slider(container);
    for (let press = 0; press < 5; press++) key(mass, "ArrowLeft");
    key(mass, " ");
    await until(() => Math.abs(number(text(container, "velocity"))) > 20);
    key(mass, "ArrowRight");
    const frozen = text(container, "position");
    expect(number(text(container, "velocity"))).toBe(0);
    await settle(120);
    expect(text(container, "position")).toBe(frozen);
    expect(demo(container).dataset.runs).toBe("1");
    key(mass, "Enter");
    expect(demo(container).dataset.runs).toBe("2");
    await until(() => demo(container).dataset.state === "settled");
    expect(number(text(container, "position"))).toBe(0);
  });

  test("a drag hands the pointer velocity to the spring: a flick keeps going, a held release starts from rest", async () => {
    const container = mount(<MassOnSpring />);
    const svg = container.querySelector("svg.physics-stage")!;
    box(svg, 560, 150);
    const mass = slider(container);
    const origin = 320 + 28;
    pointer(mass, "pointerdown", origin);
    for (let step = 1; step <= 6; step++) {
      pointer(mass, "pointermove", origin + step * 6);
      await settle(8);
    }
    expect(number(text(container, "position"))).toBeGreaterThan(20);
    pointer(mass, "pointerup", origin + 36, 0, 0);
    expect(demo(container).dataset.runs).toBe("1");
    // The flick was moving right when released, so the mass first keeps travelling right.
    expect(number(text(container, "velocity"))).toBeGreaterThan(50);
    await until(() => demo(container).dataset.state === "settled");

    pointer(mass, "pointerdown", origin);
    pointer(mass, "pointermove", origin + 40);
    await settle(150);
    pointer(mass, "pointerup", origin + 40, 0, 0);
    expect(number(text(container, "velocity"))).toBe(0);
    expect(demo(container).dataset.runs).toBe("2");
    await until(() => demo(container).dataset.state === "settled");
  });

  test("losing focus while the mass is held by the keyboard lets it go", async () => {
    const container = mount(<MassOnSpring />);
    const mass = slider(container);
    key(mass, "ArrowRight");
    act(() => void mass.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(demo(container).dataset.runs).toBe("1");
    await until(() => demo(container).dataset.state === "settled");
  });

  test("with reduced motion a release jumps to rest, and Play anyway brings the motion back", async () => {
    reduceMotion(true);
    const container = mount(<MassOnSpring />);
    expect(container.querySelector('[role="note"]')?.textContent).toMatch(/reduced motion/i);
    const mass = slider(container);
    key(mass, "ArrowRight");
    key(mass, "Enter");
    expect(number(text(container, "position"))).toBe(0);
    expect(demo(container).dataset.runs).toBe("1");
    await until(() => demo(container).dataset.state === "settled");

    act(() => button(container, "Play anyway").click());
    key(mass, "ArrowRight");
    key(mass, "Enter");
    expect(demo(container).dataset.state).toBe("animating");
    await until(() => demo(container).dataset.state === "settled");
  });

  test("describes what happened in a polite live region, not per frame", async () => {
    const container = mount(<MassOnSpring />);
    const live = container.querySelector("[aria-live]")!;
    const mass = slider(container);
    key(mass, "ArrowRight");
    expect(live.textContent).toMatch(/holding/i);
    key(mass, "Enter");
    expect(live.textContent).toMatch(/released/i);
    await until(() => demo(container).dataset.state === "settled");
    expect(live.textContent).toMatch(/rest/i);
  });
});

describe("DampingRatio", () => {
  const range = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="range"]')!;
  const change = (input: HTMLInputElement, value: string) =>
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  test("one native range controls zeta; zeta and bounce are both shown, and stiffness and damping follow springParams", () => {
    const container = mount(<DampingRatio />);
    const input = range(container);
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(1);
    expect(container.querySelector(`label[for="${input.id}"]`)?.textContent).toMatch(/damping ratio/i);
    change(input, "0.5");
    expect(text(container, "zeta")).toBe("0.50");
    expect(text(container, "bounce")).toBe("0.50");
    expect(text(container, "kind")).toBe("underdamped");
    // duration 0.6: omega = 2 pi / 0.6, stiffness = omega^2, damping = 2 zeta omega.
    const omega = (2 * Math.PI) / 0.6;
    expect(number(text(container, "stiffness"))).toBeCloseTo(omega * omega, 0);
    expect(number(text(container, "damping"))).toBeCloseTo(2 * 0.5 * omega, 1);
    expect(number(text(container, "overshoot"))).toBeCloseTo(16.3, 1);
  });

  test("past 1 the bounce goes negative and the behavior changes; at 1 it is critically damped with no overshoot", () => {
    const container = mount(<DampingRatio />);
    const input = range(container);
    change(input, "1");
    expect(text(container, "kind")).toBe("critically damped");
    expect(text(container, "bounce")).toBe("0.00");
    expect(number(text(container, "overshoot"))).toBe(0);
    change(input, "1.5");
    expect(text(container, "kind")).toBe("overdamped");
    expect(number(text(container, "bounce"))).toBeLessThan(0);
  });

  test("the current curve is redrawn on a change, and the three reference curves stay put", () => {
    const container = mount(<DampingRatio />);
    const current = container.querySelector(".physics-current")!;
    const references = [...container.querySelectorAll(".physics-reference")].map((path) => path.getAttribute("d"));
    expect(references).toHaveLength(3);
    const before = current.getAttribute("d");
    change(range(container), "0.2");
    expect(current.getAttribute("d")).not.toBe(before);
    expect([...container.querySelectorAll(".physics-reference")].map((path) => path.getAttribute("d"))).toEqual(references);
  });

  test("Replay runs a real spring: animating, one run, then settled with the ball at the target", async () => {
    const container = mount(<DampingRatio />);
    act(() => button(container, "Replay").click());
    expect(demo(container).dataset.runs).toBe("1");
    expect(demo(container).dataset.state).toBe("animating");
    await until(() => demo(container).dataset.state === "settled");
    expect(container.querySelector(".physics-ball")!.getAttribute("cx")).toBe(container.querySelector(".physics-target-tick")!.getAttribute("x1"));
  });

  test("with reduced motion Replay jumps, and the curve still updates", async () => {
    reduceMotion(true);
    const container = mount(<DampingRatio />);
    expect(container.querySelector('[role="note"]')).not.toBeNull();
    act(() => button(container, "Replay").click());
    expect(demo(container).dataset.runs).toBe("1");
    await until(() => demo(container).dataset.state === "settled");
  });
});

describe("PhasePortrait", () => {
  const point = (container: HTMLElement) => container.querySelector<HTMLElement>('[role="slider"]')!;

  test("the mark sits beside the figure and the state point is a focusable slider that reports both numbers", () => {
    const container = mount(<PhasePortrait />);
    expect(container.querySelector("[data-mark] path")!.getAttribute("d")).toMatch(/^M/);
    expect(point(container).getAttribute("aria-label")).toMatch(/position and velocity/i);
    expect(point(container).getAttribute("aria-valuetext")).toMatch(/position/i);
    expect(point(container).getAttribute("aria-valuetext")).toMatch(/velocity/i);
  });

  test("Pull and release draws a trail from the start state and ends at rest on the origin", async () => {
    const container = mount(<PhasePortrait />);
    expect(container.querySelector(".physics-trail")!.getAttribute("d") ?? "").toBe("");
    act(() => button(container, "Pull and release").click());
    expect(demo(container).dataset.runs).toBe("1");
    expect(demo(container).dataset.state).toBe("animating");
    await until(() => (container.querySelector(".physics-trail")!.getAttribute("d") ?? "").length > 60);
    await until(() => demo(container).dataset.state === "settled");
    expect(number(text(container, "position"))).toBe(0);
    expect(number(text(container, "velocity"))).toBe(0);
  });

  test("Kick starts at the rest position with a velocity: the state is a point with two coordinates", async () => {
    const container = mount(<PhasePortrait />);
    act(() => button(container, "Kick").click());
    await until(() => Math.abs(number(text(container, "velocity"))) > 0.2);
    expect(demo(container).dataset.runs).toBe("1");
    await until(() => demo(container).dataset.state === "settled");
  });

  test("arrow keys move the point (left and right: position, up and down: velocity) and preview the path before the release", () => {
    const container = mount(<PhasePortrait />);
    const dot = point(container);
    key(dot, "ArrowRight");
    key(dot, "ArrowRight");
    key(dot, "ArrowUp");
    expect(number(text(container, "position"))).toBeCloseTo(0.2, 5);
    expect(number(text(container, "velocity"))).toBeGreaterThan(0);
    expect(container.querySelector(".physics-ghost")!.getAttribute("d")).toMatch(/^M/);
    expect(demo(container).dataset.runs).toBe("0");
    key(dot, "Enter");
    expect(demo(container).dataset.runs).toBe("1");
  });

  test("a drag on the plane sets the state and the release continues from exactly that state", async () => {
    const container = mount(<PhasePortrait />);
    const plane = container.querySelector("svg.physics-plane")!;
    box(plane, 320, 320);
    pointer(plane, "pointerdown", 160 + 100, 160 - 50);
    expect(number(text(container, "position"))).toBeGreaterThan(0.3);
    expect(number(text(container, "velocity"))).toBeGreaterThan(0.1);
    pointer(plane, "pointerup", 160 + 100, 160 - 50, 0);
    expect(demo(container).dataset.runs).toBe("1");
    await until(() => demo(container).dataset.state === "settled");
  });

  test("changing zeta in flight keeps the state and counts as another run; the ratio is shown", async () => {
    const container = mount(<PhasePortrait />);
    const input = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    act(() => button(container, "Pull and release").click());
    await settle(60);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "0.7");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(text(container, "zeta")).toBe("0.70");
    expect(Number(demo(container).dataset.runs)).toBe(2);
    await until(() => demo(container).dataset.state === "settled");
  });

  test("with reduced motion the whole spiral appears at once and the figure is at rest", async () => {
    reduceMotion(true);
    const container = mount(<PhasePortrait />);
    act(() => button(container, "Pull and release").click());
    expect((container.querySelector(".physics-trail")!.getAttribute("d") ?? "").length).toBeGreaterThan(60);
    expect(number(text(container, "position"))).toBe(0);
    expect(demo(container).dataset.runs).toBe("1");
    await until(() => demo(container).dataset.state === "settled");
  });
});

describe("Interruption", () => {
  const send = (container: HTMLElement) => button(container, /^(Send both|Retarget both)/);

  test("one press sends both lanes; a second press while they move retargets both: the restart lane drops its velocity, the damped lane keeps it", async () => {
    const container = mount(<Interruption />);
    act(() => send(container).click());
    expect(demo(container).dataset.runs).toBe("2");
    expect(demo(container).dataset.state).toBe("animating");
    await until(() => Math.abs(number(text(container, "damped-now"))) > 0.5);
    act(() => send(container).click());
    expect(demo(container).dataset.runs).toBe("4");

    const before = number(text(container, "damped-before"));
    expect(before).toBeGreaterThan(0.5);
    expect(text(container, "damped-after")).toBe(text(container, "damped-before"));
    expect(text(container, "restart-before")).toBe(text(container, "damped-before"));
    expect(number(text(container, "restart-after"))).toBe(0);
    await until(() => demo(container).dataset.state === "settled");
    expect(demo(container).dataset.runs).toBe("4");
  });

  test("the restart lane is a real new spring from rest: its path and the damped path diverge after the retarget", async () => {
    const container = mount(<Interruption />);
    act(() => send(container).click());
    await until(() => Math.abs(number(text(container, "damped-now"))) > 0.5);
    act(() => send(container).click());
    await settle(150);
    const restart = container.querySelector(".physics-restart-line")!.getAttribute("d");
    const damped = container.querySelector(".physics-damped-line")!.getAttribute("d");
    expect(restart).toMatch(/^M/);
    expect(damped).toMatch(/^M/);
    expect(restart).not.toBe(damped);
    await until(() => demo(container).dataset.state === "settled");
  });

  test("each press moves the target on to the next stop and the third goes back to the start", async () => {
    const container = mount(<Interruption />);
    const labels: string[] = [send(container).textContent!];
    for (let press = 0; press < 3; press++) {
      act(() => send(container).click());
      labels.push(send(container).textContent!);
      await settle(60);
    }
    expect(labels).toEqual([
      "Send both to the right",
      "Retarget both further right",
      "Retarget both back to the left",
      "Send both to the right",
    ]);
    // Three presses end where the first began: the last stop is the start.
    await until(() => demo(container).dataset.state === "settled");
    const ticks = [...container.querySelectorAll(".physics-lanes g:last-child .physics-start-tick")].map((tick) => tick.getAttribute("x1"));
    expect(container.querySelectorAll(".physics-lanes .physics-ball")[1]!.getAttribute("cx")).toBe(ticks[0]!);
    expect(demo(container).dataset.runs).toBe("6");
  });

  test("a forward retarget in flight stalls the restart lane and carries the damped lane on", async () => {
    const container = mount(<Interruption />);
    act(() => send(container).click());
    await until(() => Math.abs(number(text(container, "damped-now"))) > 1);
    act(() => send(container).click());
    const speed = number(text(container, "damped-before"));
    expect(speed).toBeGreaterThan(1);
    expect(number(text(container, "restart-after"))).toBe(0);
    expect(number(text(container, "damped-after"))).toBeCloseTo(speed, 2);
    await until(() => demo(container).dataset.state === "settled");
    const ticks = [...container.querySelectorAll(".physics-lanes g:last-child .physics-start-tick")].map((tick) => tick.getAttribute("x1"));
    // Two presses end on the second stop, not back at the start.
    expect(container.querySelectorAll(".physics-lanes .physics-ball")[1]!.getAttribute("cx")).toBe(ticks[2]!);
  });

  test("the R key is the shortcut for the same button, and the button says where it sends the lanes", async () => {
    const container = mount(<Interruption />);
    expect(send(container).textContent).toMatch(/right/i);
    expect(send(container).getAttribute("aria-keyshortcuts")).toBe("R");
    key(send(container), "r");
    expect(demo(container).dataset.runs).toBe("2");
    expect(send(container).textContent).toMatch(/Retarget both/);
    await until(() => demo(container).dataset.state === "settled");
  });

  test("Reset puts both lanes back at rest and clears the readouts", async () => {
    const container = mount(<Interruption />);
    act(() => send(container).click());
    await until(() => demo(container).dataset.state === "settled");
    act(() => button(container, "Reset").click());
    expect(number(text(container, "damped-now"))).toBe(0);
    expect(text(container, "damped-before")).toBe("–");
    expect(send(container).textContent).toMatch(/right/i);
  });

  test("with reduced motion both lanes jump to the target and say there is no velocity to compare", async () => {
    reduceMotion(true);
    const container = mount(<Interruption />);
    expect(container.querySelector('[role="note"]')).not.toBeNull();
    act(() => send(container).click());
    expect(demo(container).dataset.runs).toBe("2");
    expect(container.querySelector("[aria-live]")!.textContent).toMatch(/reduced motion/i);
    await until(() => demo(container).dataset.state === "settled");
  });
});
