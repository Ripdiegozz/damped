import type { SpringOptions, SpringValue } from "@damped/core";

export interface MotionState {
  position: number;
  velocity: number;
}

// A value at its target with no velocity has nothing to do, so a launch that starts there with a velocity is moved
// this far first. It is far below anything a figure can show.
const NUDGE = 1e-9;

/**
 * Starts `value` from an arbitrary state (a release carries the velocity of the hand) toward `target`. `set()` always
 * starts from the value's own velocity, which a drag has reset, so the state is handed over with `rebase()`: it keeps
 * the spring's target and options and replaces position and velocity. Resolves like `set()`.
 */
export function launch(value: SpringValue, state: MotionState, target: number, options: SpringOptions): Promise<boolean> {
  value.jump(state.position === target && state.velocity !== 0 ? state.position + NUDGE : state.position);
  const finished = value.set(target, options);
  if (value.animating) value.rebase(state.position, state.velocity);
  return finished;
}
