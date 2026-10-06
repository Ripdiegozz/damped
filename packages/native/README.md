# @damped/native

Physics-based spring animations for [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) that keep their velocity when they are interrupted.

```sh
npx expo install react-native-reanimated   # the peer dependency
npm install @damped/native                 # bun add / pnpm add work the same way
```

> Published to npm as `@damped/native` (`0.1.0`).

## Requirements

| Requirement | Version |
| --- | --- |
| Expo SDK | 57 |
| `react-native-reanimated` | 4.0 or newer (peer dependency). Developed against 4.5.1. |
| `react-native-worklets` | 0.10.1 is what the package is developed against. |
| React Native | 0.86.3 is what it is developed against, with the New Architecture. Reanimated 4 supports only the New Architecture. |

## Quick start

```tsx
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { withDamped } from "@damped/native";

function Card() {
  const x = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // Press again while it moves: the new spring starts with the velocity the old one had.
  const toggle = () => {
    x.value = withDamped(x.value === 0 ? 200 : 0, { duration: 0.5, bounce: 0.15 });
  };

  return <Animated.View onTouchEnd={toggle} style={[{ width: 80, height: 80, backgroundColor: "#16181d" }, style]} />;
}
```

`withDamped` is a drop-in for `withSpring`. It runs on the UI thread.

## What is in the package

| Export | Kind | Use it to |
| --- | --- | --- |
| [`withDamped`](#withdamped) | function (worklet) | Animate a shared value with a spring that keeps velocity on reversal. |
| [`toReanimated`](#toreanimated) | function (worklet) | Turn damped's options into a physics config for Reanimated's own `withSpring`. |
| `DampedOptions`, `DampedSpringOptions`, `DampedParams` | types | Describe the options and the physics config. |

## withDamped

```ts no-check
withDamped(toValue: number, options?: DampedOptions, callback?: AnimationCallback): number
```

Returns an animation that you assign to a shared value (the return type is `number`, as with `withSpring`).

### Options

`DampedOptions` is either the perceptual form or the physical form, plus two more options. Rest thresholds apply to both.

| Option | Default | Valid values | Meaning |
| --- | --- | --- | --- |
| `duration` | `0.5` | finite, `> 0` (seconds) | The period of the underlying oscillation, not the time to rest. |
| `bounce` | `0.15` | `-1 < bounce < 1` | `0` is critically damped, above `0` overshoots, below `0` is overdamped. |
| `stiffness` | none | finite, `> 0` | Physical form. Giving it selects the physical form, and then `damping` is required. |
| `damping` | none | finite, `>= 0` | Physical form. |
| `mass` | `1` | finite, `> 0` | Physical form. |
| `restDelta` | `0.001` | finite, `> 0` | The animation ends when it is within this distance of `toValue`... |
| `restSpeed` | `0.01` | finite, `> 0` | ...and slower than this (units per second). |
| `velocity` | `0` | finite | Initial velocity in units per second, for a spring that starts from rest (a fling). |
| `reduceMotion` | `ReduceMotion.System` | `ReduceMotion` from Reanimated | See [Reduced motion](#reduced-motion). |

These are the same options, with the same defaults and validation, as the spring options of [`@damped/core`](../core/README.md#spring-options). An invalid value throws a `RangeError` synchronously when `withDamped` is called, for example `duration must be a finite number greater than 0, received 0`.

### Callback

The last argument is Reanimated's usual `(finished?, current?) => void`. It receives `true` when the animation settled and `false` when a later animation interrupted it. It runs on the UI thread, like the callbacks of Reanimated's own animations.

### Velocity and interruption

- When a running animation is interrupted, its current velocity becomes the starting velocity of the new one. There is no clipping, so reversing mid-flight turns around smoothly instead of starting from a standstill.
- The `velocity` option applies only to a spring that starts from rest. A previous animation that is moving always wins, and one that finished or has no velocity leaves the option in charge.
- An animation that starts at its target with no velocity finishes at once.

### How the spring is evaluated

The state at each frame is computed in closed form from the start of the animation: `t = (now - startTime) / 1000`. It is not integrated frame by frame, so the result does not depend on the frame rate and a long frame does not change where the spring ends up. Under-, critically and over-damped springs are all exact.

### Composing with other animations

`withDamped` is built with Reanimated's public `defineAnimation`, the mechanism the built-in `with*` helpers are made of, so `withSequence`, `withDelay` and `withRepeat` can take it as an argument. A preceding animation that exposes a velocity (another `withDamped`, or `withSpring`) hands it over, which is how a spring in a sequence continues smoothly.

```tsx
import { useSharedValue, withDelay, withSequence } from "react-native-reanimated";
import { withDamped } from "@damped/native";

function usePulse() {
  const scale = useSharedValue(1);
  const pulse = () => {
    scale.value = withSequence(withDamped(1.2, { duration: 0.2 }), withDelay(100, withDamped(1, { duration: 0.4, bounce: 0 })));
  };
  return { scale, pulse };
}
```

This composition is not covered by the package's tests, which run against a stand-in for the parts of Reanimated that `withDamped` touches. Treat it as expected behavior that has not been run in an app.

## toReanimated

```ts no-check
toReanimated(options?: DampedSpringOptions): DampedParams   // { stiffness, damping, mass }
```

If you would rather stay on Reanimated's `withSpring`, convert damped's options to its physics-based config:

```tsx
import { useSharedValue, withSpring } from "react-native-reanimated";
import { toReanimated } from "@damped/native";

function useSlide() {
  const x = useSharedValue(0);
  const slide = () => {
    x.value = withSpring(200, toReanimated({ duration: 0.5, bounce: 0.15 }));
  };
  return { x, slide };
}
```

- The result has only `stiffness`, `damping` and `mass`. The mass is always set explicitly, because `withSpring` defaults it to 4 instead of 1. Rest thresholds, `velocity` and `reduceMotion` are options of `withSpring` that you set yourself.
- It validates like `withDamped` and throws a `RangeError` for invalid options.
- You get `withSpring`'s behavior, including the two differences below.

## Reduced motion

`reduceMotion` follows Reanimated's `ReduceMotion`:

| Value | Behavior |
| --- | --- |
| `ReduceMotion.System` (default) | The system setting decides when the animation starts. |
| `ReduceMotion.Always` | Always reduced. |
| `ReduceMotion.Never` | Never reduced. |

When motion is reduced, Reanimated skips the animation: the value jumps to `toValue` and the animation ends. `withDamped` hands the choice to Reanimated this way: only `Always` and `Never` are pinned, and `System` is resolved by Reanimated when the animation starts.

## Why not just `withSpring`

Both solve the same spring equation. They differ in two cases, and in how time is handled. This is what Reanimated 4.5.1 does (`src/animation/spring/spring.ts`):

| | `withSpring` (Reanimated 4.5.1) | `withDamped` |
| --- | --- | --- |
| Reversal | When a spring is retargeted, a velocity that points away from the new target is set to 0 (lines 189 to 197). The motion starts from a standstill and the momentum is lost. | The velocity is kept. |
| Damping ratio of 1 or more | Chooses the under-damped formula for `zeta < 1` and the critical one otherwise (line 116), so `bounce < 0` or a large `damping` behaves like `bounce: 0`. | Uses the overdamped solution above 1. |
| Time | Steps from the previous frame, with each step clamped to 64 ms (line 106). | Evaluates at `now - startTime`. |

The claims about `withDamped` are covered by tests against the core: its trajectory matches `@damped/core` to within 1e-9, a reversal keeps the velocity that `withSpring` would zero, and a long frame is not clamped.

## Why the package ships unminified

`'worklet'` directives mark the functions that Reanimated runs on the UI thread, and the `react-native-worklets` Babel plugin finds them by that string. Minifying the bundle strips the directives, so the package is built without a minifier. The math module imports nothing, because a worklet can only call other worklets. The built file is 5,319 bytes, or 1,609 bytes gzip (see [bundle size](../../README.md#bundle-size)); your app's own minifier runs after the plugin.

## Limitations

- **Not run on a device.** There is no simulator or physical device in this repository's checks. What is verified is the math against the core, the behavior against a stand-in for Reanimated, and that the built bundle is transformed into worklets by the `react-native-worklets` Babel plugin. Behavior inside a running app is expected, not observed.
- It targets the Reanimated 4 API (`defineAnimation`, `ReduceMotion`). Older versions are not supported.
- It animates numbers. Colors, transforms as arrays and other value types are not handled by `withDamped`.

## Exported types

| Type | What it is |
| --- | --- |
| `DampedSpringOptions` | The spring options: perceptual (`duration`, `bounce`) or physical (`stiffness`, `damping`, `mass`), with `restDelta` and `restSpeed`. |
| `DampedOptions` | `DampedSpringOptions` plus `velocity` and `reduceMotion`. |
| `DampedParams` | `{ stiffness, damping, mass }`, what `toReanimated` returns. |

## License

MIT. See [LICENSE](./LICENSE).
