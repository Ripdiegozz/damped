# @damped/native

Spring animations for [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) that keep their velocity when they are interrupted.

```sh
npm install @damped/native
npx expo install react-native-reanimated
```

Requirements: Expo SDK 57, `react-native-reanimated` 4.0 or newer and the New Architecture. Developed and tested against Reanimated 4.5.1 and `react-native-worklets` 0.10.1.

## `withDamped`

A drop-in for `withSpring` that runs on the UI thread. It takes the same perceptual options as the `damped` core (`duration` in seconds, `bounce` from -1 to 1) or physical ones (`stiffness`, `damping`, `mass`).

```tsx
import { withDamped } from "@damped/native";

const x = useSharedValue(0);

// Reverse at any time: the new spring starts with the velocity the old one had.
const onPress = () => {
  x.value = withDamped(x.value === 0 ? 200 : 0, { duration: 0.5, bounce: 0.15 });
};
```

Options: `duration`, `bounce`, `stiffness`, `damping`, `mass`, `velocity`, `restDelta`, `restSpeed`, `reduceMotion`. The last argument is the usual `(finished?, current?) => void` callback. It is a worklet, so you can call it from gesture handlers and `useAnimatedStyle`.

`velocity` seeds a spring that starts from rest (for example a fling). When a running animation is interrupted, its own velocity is used instead.

## `toReanimated`

If you would rather stay on `withSpring`, convert the options to its physics-based config:

```tsx
import { withSpring } from "react-native-reanimated";
import { toReanimated } from "@damped/native";

x.value = withSpring(200, toReanimated({ duration: 0.5, bounce: 0.15 }));
```

The mass is always set explicitly, because Reanimated defaults it to 4 instead of 1.

## Why `withDamped` exists

Both solve the same spring equation in closed form. They differ in two cases (Reanimated 4.5.1, `src/animation/spring/spring.ts`):

- **Reversal.** When a spring is retargeted, `withSpring` sets the velocity to 0 if it points away from the new target. Reversing mid-flight therefore starts from a standstill and loses the momentum the animation had. `withDamped` keeps the velocity, so the motion carries on and turns around smoothly.
- **Overdamped springs.** `withSpring` evaluates every damping ratio of 1 or more with the critically damped formula, so `bounce < 0` (or a large `damping`) behaves like `bounce: 0`. `withDamped` uses the overdamped solution.

`withDamped` also evaluates the spring at `now - startTime` instead of integrating per frame, so its state does not depend on the frame rate or on frame hitches.
