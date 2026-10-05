// A faithful stand-in for the parts of react-native-reanimated 4.5.1 that withDamped touches:
// `defineAnimation` and the reduce-motion decoration (src/animation/util.ts), plus the shared
// value setter that drives an animation (src/valueSetter.ts). Frames are driven by the test.

export const ReduceMotion = { System: "system", Always: "always", Never: "never" } as const;

type Animation = Record<string, any>;

export const runtime = { kind: "ui" as "ui" | "js", systemReduceMotion: false };

const reduceMotionFromConfig = (config?: string): boolean =>
  !config || config === ReduceMotion.System ? runtime.systemReduceMotion : config === ReduceMotion.Always;

// util.ts decorateAnimation(): only the plain-number path is relevant here.
function decorateAnimation(animation: Animation): void {
  const baseOnStart = animation.onStart;
  animation.onStart = (current: Animation, value: number, timestamp: number, previous: Animation | undefined) => {
    if (current.reduceMotion === undefined) current.reduceMotion = reduceMotionFromConfig();
    if (current.reduceMotion) {
      if (current.toValue !== undefined) current.current = current.toValue;
      else baseOnStart(current, value, timestamp, previous);
      current.startTime = 0;
      current.onFrame = () => true;
      return;
    }
    baseOnStart(current, value, timestamp, previous);
  };
}

// util.ts defineAnimation(): on the UI runtime it returns the decorated animation, on the JS
// runtime a definition that the shared value setter invokes later on the UI runtime.
export const defineCalls: Array<{ starting: unknown }> = [];

export function defineAnimation(starting: unknown, factory: () => Animation): any {
  defineCalls.push({ starting });
  const create = () => {
    const animation = factory();
    decorateAnimation(animation);
    return animation;
  };
  if (runtime.kind === "ui") return create();
  (create as any).__isAnimationDefinition = true;
  return create;
}

// valueSetter.ts: cancels the previous animation, starts the new one and steps it per frame.
export class FakeSharedValue {
  value: number;
  animation: Animation | null = null;
  private pendingStep: ((timestamp: number) => void) | null = null;

  constructor(initial: number) {
    this.value = initial;
  }

  assign(next: number | (() => Animation) | Animation, now: number): void {
    const previous = this.animation;
    if (previous) {
      this.animation = null;
      if (!previous.finished) {
        previous.cancelled = true;
        previous.callback?.(false);
      }
    }
    if (typeof next !== "function" && typeof next !== "object") {
      this.value = next;
      return;
    }
    const animation = typeof next === "function" ? next() : next;
    if (this.value === animation.current && !animation.isHigherOrder) {
      animation.callback?.(true);
      return;
    }
    animation.onStart(animation, this.value, now, previous);
    this.animation = animation;
    this.pendingStep = (timestamp) => {
      if (animation.cancelled) return;
      const finished = animation.onFrame(animation, timestamp);
      animation.timestamp = timestamp;
      this.value = animation.current;
      if (finished) {
        animation.finished = true;
        animation.callback?.(true);
      }
    };
    this.pendingStep(now);
  }

  frame(now: number): void {
    if (this.animation && !this.animation.finished) this.pendingStep?.(now);
  }

  get running(): boolean {
    return this.animation !== null && !this.animation.finished && !this.animation.cancelled;
  }
}
