import { defineAnimation, ReduceMotion } from "react-native-reanimated";
import type { Animation, AnimationCallback } from "react-native-reanimated";
import { dampedParams, dampedRestThresholds, dampedState, isRest } from "./math";
import type { DampedParams, DampedSpringOptions } from "./math";

export type { DampedParams, DampedSpringOptions } from "./math";

export type DampedOptions = DampedSpringOptions & {
  /** Initial velocity in units per second, used when no running animation passes its own. */
  velocity?: number;
  reduceMotion?: ReduceMotion;
};

interface DampedAnimation extends Animation<DampedAnimation> {
  toValue: number;
  current: number;
  velocity: number;
  startTime: number;
  startDisplacement: number;
  startVelocity: number;
}

/**
 * Maps damped's perceptual options to a physics-based `withSpring` config. The mass is always
 * explicit because Reanimated would otherwise default it to 4.
 */
export function toReanimated(options?: DampedSpringOptions): DampedParams {
  return dampedParams(options);
}

/**
 * A spring animation for Reanimated shared values. The state is computed analytically from the
 * start of the animation, and an interrupted animation hands its velocity to the next one without
 * clipping it, so reversals stay continuous.
 */
export function withDamped(toValue: number, options?: DampedOptions, callback?: AnimationCallback): number {
  "worklet";
  const params = dampedParams(options);
  const { restDelta, restSpeed } = dampedRestThresholds(options);
  const velocity = options?.velocity ?? 0;
  if (!Number.isFinite(velocity)) {
    throw new RangeError(`velocity must be a finite number, received ${velocity}`);
  }
  const reduceMotionOption = options?.reduceMotion;
  // withSpring pins only an explicit choice; the system default is resolved when the animation starts.
  const reduceMotion =
    reduceMotionOption === ReduceMotion.Always ? true : reduceMotionOption === ReduceMotion.Never ? false : undefined;

  return defineAnimation<DampedAnimation>(toValue as never, () => {
    "worklet";

    function onStart(
      animation: DampedAnimation,
      value: number,
      now: number,
      previousAnimation: { velocity?: unknown } | null | undefined,
    ): void {
      const inherited = previousAnimation?.velocity;
      // An animation that is not moving (finished, or not a spring) leaves the velocity option in charge.
      const startVelocity =
        typeof inherited === "number" && inherited !== 0 && Number.isFinite(inherited) ? inherited : velocity;
      animation.current = value;
      animation.startTime = now;
      animation.startDisplacement = value - animation.toValue;
      animation.startVelocity = startVelocity;
      animation.velocity = startVelocity;
    }

    function onFrame(animation: DampedAnimation, now: number): boolean {
      const t = Math.max(now - animation.startTime, 0) / 1000;
      const state = dampedState(animation.startDisplacement, animation.startVelocity, params, t);
      if (isRest(state.position, state.velocity, restDelta, restSpeed)) {
        animation.current = animation.toValue;
        animation.velocity = 0;
        return true;
      }
      animation.current = animation.toValue + state.position;
      animation.velocity = state.velocity;
      return false;
    }

    return {
      onStart,
      onFrame,
      toValue,
      current: toValue,
      velocity,
      startTime: 0,
      startDisplacement: 0,
      startVelocity: 0,
      callback,
      reduceMotion,
    } as DampedAnimation;
  }) as unknown as number;
}
