import type { SpringOptions, SpringValue } from "@damped/core";

/** `restart`: what an easing curve does. `damped`: what a spring does. */
export type LaneMode = "restart" | "damped";

export interface RetargetResult {
  /** Velocity of the lane just before the retarget. */
  before: number;
  /** Velocity of the lane right after it: the damped lane keeps it, the restart lane has none. */
  after: number;
  finished: Promise<boolean>;
}

/**
 * Sends a lane to a new target. The damped lane is a plain `set()`: the new spring starts from the position and the
 * velocity the value had. The restart lane is the naive animation, built honestly from the same pieces: `jump()` to
 * where the value is (which drops its velocity) and then a new spring from rest.
 */
export function retarget(value: SpringValue, mode: LaneMode, target: number, options: SpringOptions): RetargetResult {
  const before = value.getVelocity();
  if (mode === "restart") value.jump(value.get());
  const finished = value.set(target, options);
  return { before, after: value.getVelocity(), finished };
}
