import { frame, type FrameInfo, type Scheduler } from "./scheduler";
import { createSpring, type Spring, type SpringOptions } from "./spring";

export interface SpringValueOptions {
  /** Scheduler that drives the value. Defaults to the shared `frame` scheduler. */
  scheduler?: Scheduler;
  /** Default rest thresholds forwarded to every spring this value creates; per-call options win. */
  restDelta?: number;
  restSpeed?: number;
}

export interface SpringValue {
  /** Last computed position. */
  get(): number;
  /** Last computed velocity in units per second. */
  getVelocity(): number;
  readonly animating: boolean;
  /** Animate to `target`. Resolves true once settled there, false if superseded by a later set/jump/stop. */
  set(target: number, options?: SpringOptions): Promise<boolean>;
  /** Set immediately with zero velocity, cancelling any animation. */
  jump(value: number): void;
  /**
   * Replace the current state. If animating, the spring continues toward its current target from (position, velocity),
   * timed from the last frame; if idle, behaves like jump(position) and ignores velocity. Notifies listeners.
   * Does not resolve or supersede the pending set() promise.
   */
  rebase(position: number, velocity?: number): void;
  /** Freeze at the current value with zero velocity. */
  stop(): void;
  onChange(listener: (value: number, velocity: number) => void): () => void;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number, received ${value}`);
}

const seeders = new WeakMap<SpringValue, (position: number, velocity: number) => void>();

/**
 * Internal (not exported from the package index): replaces the state of a value with a position and velocity without
 * animating. Any animation in flight is cancelled (its promise resolves false); listeners are notified. Unlike
 * jump() the velocity is kept, so the next set() inherits it. This is how a driver that moved the value elsewhere
 * (the compositor) hands the exact state back.
 */
export function seedSpringValue(value: SpringValue, position: number, velocity = 0): void {
  const seed = seeders.get(value);
  if (seed === undefined) throw new TypeError("seedSpringValue needs a value created by createSpringValue");
  seed(position, velocity);
}

export function createSpringValue(initial: number, options: SpringValueOptions = {}): SpringValue {
  assertFinite("initial value", initial);
  const scheduler = options.scheduler ?? frame;
  const thresholds: { restDelta?: number; restSpeed?: number } = {};
  if (options.restDelta !== undefined) thresholds.restDelta = options.restDelta;
  if (options.restSpeed !== undefined) thresholds.restSpeed = options.restSpeed;

  let position = initial;
  let velocity = 0;
  let spring: Spring | undefined;
  // Options of the running spring, kept so rebase() can rebuild it from a new state.
  let springConfig: SpringOptions | undefined;
  let resolve: ((settled: boolean) => void) | undefined;
  let cancelLoop: (() => void) | undefined;
  // Timestamp the current spring's t=0 maps to; undefined until the first frame that runs it.
  let startTime: number | undefined;
  // Timestamp of the frame that produced `position`/`velocity`.
  let lastTimestamp: number | undefined;
  let listeners: ((value: number, velocity: number) => void)[] = [];

  const notify = (): void => {
    // Iterate a snapshot so listeners may unsubscribe or subscribe while being notified.
    for (const listener of listeners) {
      try {
        listener(position, velocity);
      } catch (error) {
        // Mirrors the scheduler: the error surfaces without breaking the value or other listeners.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  };

  const endAnimation = (settled: boolean): void => {
    spring = undefined;
    const pending = resolve;
    resolve = undefined;
    pending?.(settled);
  };

  const cancel = (): void => {
    cancelLoop?.();
    cancelLoop = undefined;
    endAnimation(false);
  };

  const tick = (info: FrameInfo): boolean => {
    const current = spring;
    if (current === undefined) return false;
    startTime ??= info.timestamp;
    lastTimestamp = info.timestamp;
    const t = (info.timestamp - startTime) / 1000;

    if (current.isSettled(t)) {
      position = current.to;
      velocity = 0;
      // Cleared before notifying so a listener calling set() starts a fresh loop.
      cancelLoop = undefined;
      const pending = resolve;
      spring = undefined;
      resolve = undefined;
      notify();
      pending?.(true);
      return false;
    }

    const state = current.at(t);
    position = state.position;
    velocity = state.velocity;
    notify();
    return true;
  };

  const set = (target: number, springOptions?: SpringOptions): Promise<boolean> => {
    assertFinite("target", target);
    if (spring === undefined && position === target && velocity === 0) return Promise.resolve(true);

    const config = { ...thresholds, ...springOptions } as SpringOptions;
    const next = createSpring(position, target, velocity, config);
    springConfig = config;
    const wasAnimating = spring !== undefined;
    const superseded = resolve;
    const promise = new Promise<boolean>((done) => {
      resolve = done;
    });
    spring = next;
    superseded?.(false);

    if (wasAnimating) {
      // Continue from the last computed state; its frame is t=0 so the next frame advances by a real delta.
      startTime = lastTimestamp;
    } else {
      startTime = undefined;
      lastTimestamp = undefined;
      cancelLoop = scheduler.loop("update", tick);
    }
    return promise;
  };

  const value: SpringValue = {
    get: () => position,
    getVelocity: () => velocity,
    get animating() {
      return spring !== undefined;
    },
    set,
    jump(value) {
      assertFinite("value", value);
      cancel();
      position = value;
      velocity = 0;
      notify();
    },
    rebase(nextPosition, nextVelocity = 0) {
      assertFinite("position", nextPosition);
      assertFinite("velocity", nextVelocity);
      if (spring === undefined) {
        position = nextPosition;
        velocity = 0;
      } else {
        // `startTime` stays put: the last frame is t=0 of the rebuilt spring, as in set().
        spring = createSpring(nextPosition, spring.to, nextVelocity, springConfig);
        position = nextPosition;
        velocity = nextVelocity;
        startTime = lastTimestamp;
      }
      notify();
    },
    stop() {
      cancel();
      velocity = 0;
    },
    onChange(listener) {
      // Wrapped so subscribing the same function twice yields independent subscriptions.
      const entry = (value: number, speed: number): void => listener(value, speed);
      listeners = [...listeners, entry];
      return () => {
        listeners = listeners.filter((other) => other !== entry);
      };
    },
  };
  seeders.set(value, (nextPosition, nextVelocity) => {
    assertFinite("position", nextPosition);
    assertFinite("velocity", nextVelocity);
    cancel();
    position = nextPosition;
    velocity = nextVelocity;
    notify();
  });
  return value;
}
