export {};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Sample<T> {
  time: number;
  value: T;
}

declare global {
  interface Window {
    damped: typeof import("../packages/core/src/index");
    e2e: {
      frames(): number;
      record<T>(probe: () => T): { samples: Sample<T>[]; stop(): void };
      rect(element: Element): Rect;
      nextFrame(): Promise<void>;
      sleep(ms: number): Promise<void>;
    };
  }
}
