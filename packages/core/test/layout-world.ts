import type { Box, LayoutOptions } from "../src/layout";
import { createScheduler, type Scheduler } from "../src/scheduler";
import { createFakeSource } from "./fake-frame-source";

export const SPRING = { duration: 0.5, bounce: 0.15 } as const;
// Rest thresholds animate() applies per unit; used to reproduce the springs the layout creates.
export const LENGTH = { ...SPRING, restDelta: 0.01, restSpeed: 0.1 };
export const RATIO = { ...SPRING, restDelta: 0.0005, restSpeed: 0.005 };
export const IDENTITY = "translate3d(0px, 0px, 0) rotate(0deg) scale(1, 1)";
const originalMatchMedia = globalThis.matchMedia;

export const A: Box = { x: 0, y: 0, width: 100, height: 100 };
export const B: Box = { x: 200, y: 100, width: 300, height: 200 };
export const C: Box = { x: 50, y: 300, width: 150, height: 100 };

export const centerX = (box: Box): number => box.x + box.width / 2;
export const centerY = (box: Box): number => box.y + box.height / 2;

export function transform(x: number, y: number, scaleX: number, scaleY: number): string {
  return `translate3d(${x}px, ${y}px, 0) rotate(0deg) scale(${scaleX}, ${scaleY})`;
}

const TRANSFORM = /^translate3d\((.+)px, (.+)px, 0\) rotate\((.+)deg\) scale\((.+), (.+)\)$/;

export function parseTransform(value: string) {
  const match = TRANSFORM.exec(value);
  if (match === null) return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  return { x: Number(match[1]), y: Number(match[2]), scaleX: Number(match[4]), scaleY: Number(match[5]) };
}

// happy-dom has no layout, so the tests supply one: a "world" state selects each element's natural box, and the
// rect an element reports adds its current inline transform around the box center (transform-origin 50% 50%).
export function createWorld(initial = "a") {
  const world = {
    state: initial,
    reads: 0,
    // Inline transform seen by every getBoundingClientRect() call.
    seen: [] as string[],
    place(element: HTMLElement, boxes: Record<string, Box>) {
      element.getBoundingClientRect = () => {
        world.reads++;
        world.seen.push(element.style.transform);
        const natural = boxes[world.state]!;
        const applied = parseTransform(element.style.transform);
        const width = natural.width * applied.scaleX;
        const height = natural.height * applied.scaleY;
        const left = centerX(natural) + applied.x - width / 2;
        const top = centerY(natural) + applied.y - height / 2;
        return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
      };
    },
    visual(element: HTMLElement): Box {
      const rect = element.getBoundingClientRect();
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
    },
  };
  return world;
}

export function setup() {
  const fake = createFakeSource();
  const inner = createScheduler(fake.source);
  let writeJobs = 0;
  const scheduler: Scheduler = {
    schedule: (phase, job) =>
      inner.schedule(
        phase,
        phase === "write"
          ? (info) => {
              writeJobs++;
              job(info);
            }
          : job,
      ),
    loop: (phase, job) => inner.loop(phase, job),
    get active() {
      return inner.active;
    },
  };
  const options = (extra: Partial<LayoutOptions> = {}): LayoutOptions => ({ ...SPRING, scheduler, ...extra });
  return {
    fake,
    scheduler,
    options,
    get writeJobs() {
      return writeJobs;
    },
  };
}

export function flushAll(fake: ReturnType<typeof createFakeSource>, from = 0, step = 16, limit = 3000): number {
  let timestamp = from;
  for (let i = 0; i < limit && fake.pending > 0; i++) {
    fake.flush(timestamp);
    timestamp += step;
  }
  return timestamp;
}

export function createElement(parent: HTMLElement = document.body): HTMLElement {
  const element = document.createElement("div");
  parent.append(element);
  return element;
}

export function trackWrites(element: HTMLElement) {
  const log: { property: string; value: string }[] = [];
  const spy = new Proxy(element.style, {
    set(target, property, value) {
      log.push({ property: String(property), value: String(value) });
      return Reflect.set(target, property, value);
    },
    get: (target, property) => Reflect.get(target, property),
  });
  Object.defineProperty(element, "style", { value: spy, configurable: true });
  return {
    log,
    values: (property: string) => log.filter((entry) => entry.property === property).map((entry) => entry.value),
  };
}

export function stubMatchMedia(matches: boolean) {
  globalThis.matchMedia = (() => ({ matches }) as MediaQueryList) as typeof matchMedia;
}

export function restoreMatchMedia() {
  globalThis.matchMedia = originalMatchMedia;
}
