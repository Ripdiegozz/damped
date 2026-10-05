# @damped/core

Spring animations for the DOM that keep their velocity when they are interrupted.

```sh
bun add @damped/core   # npm install / pnpm add work the same way
```

> Published to npm as `@damped/core` (`0.1.0`).

## Quick start

```ts
import { animate } from "@damped/core";

const card = document.querySelector<HTMLElement>(".card")!;

animate(card, { x: 200, opacity: 0.5 }, { duration: 0.5, bounce: 0.2 });

// Later, while it is still moving: the new animation starts from the position and velocity of the old one.
animate(card, { x: 0, opacity: 1 });
```

`animate` writes `transform`, `opacity` and `filter` straight to the element, one write per frame, from a single `requestAnimationFrame` loop that sleeps when nothing is animating. It has no dependencies and never imports React.

## What is in the package

| You want to | Use | Section |
| --- | --- | --- |
| Move an element to a position, scale, rotation, opacity or blur | `animate` | [animate](#animate) |
| Keep that running while the main thread is busy | `animate` with `compositor` | [Drivers](#drivers) |
| Animate an element to where the layout just moved it | `layout`, `snapshot`, `measureLayout` | [Layout](#layout-flip) |
| Turn one element into another (card to dialog) | `morph` | [morph](#morph) |
| Fade and slide elements in and out of the DOM | `enter`, `exit` | [Presence](#presence-enter-and-exit) |
| Animate a plain number | `createSpringValue` | [createSpringValue](#createspringvalue) |
| Evaluate a spring yourself | `createSpring`, `springParams` | [Springs](#springs) |
| Control the frame loop, or test without a browser | `createScheduler`, `frame` | [Scheduler](#scheduler) |

Everything below is exported from `@damped/core`.

## Spring options

Every API takes the same options. Use perceptual options (a duration and a bounce) or physical ones (stiffness and damping).

```ts
import type { SpringOptions } from "@damped/core";

const perceptual: SpringOptions = { duration: 0.5, bounce: 0.15 };
const physical: SpringOptions = { stiffness: 170, damping: 26, mass: 1 };
```

| Option | Default | Valid values | Meaning |
| --- | --- | --- | --- |
| `duration` | `0.5` | finite, `> 0` (seconds) | The period of the underlying oscillation. It is not the time to rest: with the defaults a spring needs about 1.16 s to settle a 100 px move (`settleTime()`). |
| `bounce` | `0.15` | `-1 < bounce < 1` | `0` is critically damped. Above `0` the spring overshoots; below `0` it is overdamped and approaches slowly without overshoot. |
| `stiffness` | none | finite, `> 0` | Physical option. Giving it selects the physical form, and then `damping` is required. |
| `damping` | none | finite, `>= 0` | Physical option. |
| `mass` | `1` | finite, `> 0` | Physical option. |
| `restDelta` | `0.001` | finite, `> 0` | The spring is at rest when it is within this distance of the target... |
| `restSpeed` | `0.01` | finite, `> 0` | ...and moves slower than this (units per second). |

- Perceptual options map to physics with mass 1: stiffness is `(2π / duration)²` and the damping ratio is `1 - bounce` for `bounce >= 0` and `1 / (1 + bounce)` below.
- Invalid values throw a `RangeError` that names the option, for example `duration must be a finite number greater than 0, received 0`.
- `animate` and the APIs built on it replace the default rest thresholds with ones that fit each property (see [animate](#animate)); you can still pass your own.

## Springs

A spring is an analytic function of time, so any moment can be evaluated directly, with no stepping.

```ts
import { createSpring, springParams } from "@damped/core";

springParams({ duration: 0.5, bounce: 0 });
// { stiffness: 157.9…, damping: 25.13…, mass: 1 }

const spring = createSpring(0, 100, 0, { duration: 0.5, bounce: 0.15 });

spring.at(0.25); // { position: 89.45…, velocity: 164.56… }
spring.isSettled(spring.settleTime()); // true
spring.settleTime(); // 1.159… seconds
```

### `springParams(options?): SpringParams`

Validates the options and returns `{ stiffness, damping, mass }`. Called without arguments it returns the defaults.

### `createSpring(from, to, velocity = 0, options?): Spring`

| Member | Meaning |
| --- | --- |
| `from`, `to`, `velocity` | The values it was created with. |
| `params` | The `SpringParams` in use. |
| `at(t)` | `{ position, velocity }` at `t` seconds after the start. |
| `isSettled(t)` | Whether the state at `t` is within `restDelta` of `to` and slower than `restSpeed`. |
| `settleTime()` | The first time after which the spring stays settled. `Infinity` for a spring that never loses energy (`damping: 0`). Cached. |

Edge cases:

- `at(t)` for `t <= 0` returns the starting state (`from` and `velocity`).
- `at(NaN)` throws a `RangeError`. `at(Infinity)` returns the target at rest, or throws a `RangeError` if the spring never settles.
- Results do not depend on how often you call `at`: the same `t` gives the same state, whatever frames came before.
- Under-, critically and over-damped springs are all exact. A spring created with an initial `velocity` carries it, so retargeting a moving spring is `createSpring(position, newTarget, velocity)`.

## Scheduler

All animation writes go through a scheduler: one frame request per frame, shared by everything, split into three phases that run in order.

| Phase | Use it for |
| --- | --- |
| `"read"` | Measuring the DOM. |
| `"update"` | Advancing animation state. Springs run here. |
| `"write"` | Writing styles. |

```ts
import { frame } from "@damped/core";

// Once, in the write phase of the next frame.
const cancel = frame.schedule("write", ({ timestamp, delta }) => {
  document.title = `frame at ${timestamp} ms, ${delta} ms after the last one`;
});

// Every frame until the job returns false.
let remaining = 3;
frame.loop("update", () => --remaining > 0);

cancel(); // cancelling a job that already ran does nothing
```

- `frame` is the shared scheduler. It is created on first use, so importing the package never touches `window`.
- A job added while a frame runs joins the current frame if its phase has not started yet, and the next frame otherwise.
- The loop sleeps when no job is left: `frame.active` is `false` and no frame is requested. The first frame after waking reports `delta: 0`.
- A job that throws is dropped, and the error is rethrown from a microtask, so the rest of the frame still runs.
- Without `requestAnimationFrame` (a server, a test) the scheduler falls back to a 16 ms timer.

### `createScheduler(source?): Scheduler`

Creates a separate scheduler. `source` is a `FrameSource` and defaults to `requestAnimationFrame`.

```ts
interface FrameSource {
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}
```

Pass your own scheduler to `animate`, `createSpringValue`, `layout`, `morph`, `enter` or `exit` with the `scheduler` option. An element is driven by the scheduler of the first `animate` call on it.

## createSpringValue

A number that moves with a spring. Use it for anything that is not a style: a counter, a canvas coordinate, a scroll offset.

```ts
import { createSpringValue } from "@damped/core";

const progress = createSpringValue(0);

const stopListening = progress.onChange((value, velocity) => {
  console.log(value, velocity);
});

await progress.set(100, { duration: 0.6 }); // true once it has settled at 100
progress.set(0); // retargets from wherever it is, keeping its velocity

stopListening();
```

| Member | Behavior |
| --- | --- |
| `get()` / `getVelocity()` | The last computed position and velocity (units per second). |
| `animating` | `true` while a spring is running. |
| `set(target, options?)` | Springs to `target` from the current state. Returns a promise: `true` when it settled at `target`, `false` if a later `set`, `jump` or `stop` superseded it. Setting the value it already rests at resolves `true` at once. |
| `jump(value)` | Sets the value now with zero velocity, cancels any animation (its promise resolves `false`) and notifies listeners. |
| `stop()` | Freezes at the current value with zero velocity. Its promise resolves `false`. Listeners are not called. |
| `rebase(position, velocity = 0)` | Replaces the current state. While animating, the spring continues toward its current target from the new state and the pending `set` promise is left alone. When idle it behaves like `jump(position)` and ignores `velocity`. Listeners are notified. |
| `onChange(listener)` | Calls `listener(value, velocity)` on every change, and returns an unsubscribe function. Subscribing the same function twice gives two independent subscriptions. A listener that throws does not break the value or other listeners; the error is rethrown from a microtask. |

`createSpringValue(initial, options?)` takes `{ scheduler, restDelta, restSpeed }`. The thresholds are defaults for every spring the value creates; options passed to `set` win.

## animate

```ts
import { animate } from "@damped/core";

const box = document.querySelector<HTMLElement>(".box")!;

const controls = animate(
  box,
  { x: 120, scale: 1.1, opacity: 0.8 },
  { duration: 0.4, bounce: 0.1, from: { x: -40 } },
);

await controls.finished; // every property has settled, or was taken over
controls.stop(); // freeze the properties this call still owns
```

`animate(target, values, options?)` takes one element or an array of elements, and returns `AnimationControls`.

### Properties

| Property | Unit | Identity | `restDelta` / `restSpeed` | Reduced motion |
| --- | --- | --- | --- | --- |
| `x`, `y` | px | `0` | `0.01` / `0.1` | jumps |
| `rotate` | degrees | `0` | `0.01` / `0.1` | jumps |
| `scale`, `scaleX`, `scaleY` | ratio | `1` | `0.0005` / `0.005` | jumps |
| `opacity` | 0 to 1 | `1`; the animation starts from the element's computed opacity the first time opacity is animated | `0.0005` / `0.005` | animates |
| `blur` | px | `0` | `0.01` / `0.1` | animates |

Values must be finite numbers. An unknown property throws a `TypeError` and a non-finite value a `RangeError`, before anything on the element changes.

### What damped writes

| Group | Inline style | Format |
| --- | --- | --- |
| Transform | `transform` | `translate3d(Xpx, Ypx, 0) rotate(Ddeg) scale(SX, SY)`, where `SX` is `scale × scaleX` and `SY` is `scale × scaleY`. At rest it is `translate3d(0px, 0px, 0) rotate(0deg) scale(1, 1)`. |
| Opacity | `opacity` | the number as a string, for example `0.5` |
| Filter | `filter` | `blur(Npx)`, or an empty string when the blur is `0.01` px or less |

Damped owns the inline `transform` of every element it animates and replaces any transform you set there, so put static transforms on a wrapper. It owns `opacity` once opacity is animated and `filter` once blur is animated. A group is written whole: animating only `x` still writes the complete `transform` string. A group that is never animated is never written.

### Options

`animate` accepts every [spring option](#spring-options) plus:

| Option | Default | Meaning |
| --- | --- | --- |
| `from` | none | Values applied immediately, as a jump, before animating. `animate(el, { x: 100 }, { from: { x: 0 } })` starts at `0`. |
| `driver` | `"js"` | `"js"` writes styles from the frame loop. Pass the exported `compositor` to hand the spring to the browser instead ([Drivers](#drivers)). |
| `reducedMotion` | `"user"` | `"user"` follows `prefers-reduced-motion`; `"always"` and `"never"` override it ([Reduced motion](#reduced-motion)). |
| `scheduler` | `frame` | The scheduler that drives the animation. |

Invalid spring options throw before any element is touched, so a bad call never leaves a half-applied animation.

### Controls and ownership

- `finished` resolves when every property set by this call has settled or been taken over by a newer call. It never rejects.
- `stop()` freezes the properties this call still owns at their current value. Properties that a newer call has since targeted are left alone.
- The latest call to target a property owns it. Retargeting keeps position and velocity: there is no jump and no velocity reset, whichever driver played the earlier animation.
- Two calls that target different properties of one element run side by side.

## Drivers

By default `animate` writes styles from the frame loop, so it stops moving if the main thread is blocked. The compositor driver plays the same spring on the browser's compositor thread through the Web Animations API.

```ts
import { animate, compositor } from "@damped/core";

const box = document.querySelector<HTMLElement>(".box")!;

animate(box, { x: 300 }, { duration: 1, driver: compositor });
```

| | `"js"` (default) | `compositor` |
| --- | --- | --- |
| Where it runs | The frame loop, on the main thread. | The compositor thread, through `element.animate`. |
| While the main thread is blocked | Stops until frames return. | Keeps moving. This is checked in Chromium by recording the frames the browser composites during a blocked main thread. |
| How it is played | One style write per frame. | The analytic spring sampled at 120 Hz into linear keyframes, one list for the transform, opacity and filter that change. Animations longer than 3 s use 360 equal intervals. |
| Accuracy | Exact at every frame. | The browser draws a straight line between samples, so it differs from the spring by at most about `acceleration × step² / 8` (about 0.4 px for a 300 px move over 0.5 s). |

Details:

- `compositor` is a value you import, not a name. An application that never passes it does not bundle it ([sizes](../../README.md#bundle-size)).
- It falls back to the JS driver, with the same result, when `element.animate` does not exist or when the spring never settles (`damping: 0`).
- When the animation ends, the final values are written inline and the Web Animation is cancelled.
- Interrupting it computes the exact spring state at that moment, analytically, and starts the next animation from it. This works from compositor to JS, from JS to compositor, and on the same element.
- `layout`, `morph`, `enter` and `exit` always use the JS driver: they correct children and radii on every frame, which needs JavaScript. The `driver` option does not exist for them.
- Under reduced motion, spatial properties jump before the driver is involved, and the rest can still run on the compositor.

## Layout (FLIP)

FLIP animates an element from where it was to where the layout just put it. Measure, change the DOM, then animate the difference.

```ts
import { layout } from "@damped/core";

const list = document.querySelector<HTMLElement>("ul")!;
const item = list.querySelector<HTMLElement>("li:last-child")!;

// snapshot → change → animate, in one call.
layout(item, () => list.prepend(item), { duration: 0.4, bounce: 0.1 });
```

### `layout(target, mutate, options?): AnimationControls`

Records the boxes of `target` (an element or an array), runs `mutate`, then animates each element from its recorded box to its new natural box. Nothing moves when the box did not change by more than 0.01 px.

### `snapshot(target): LayoutSnapshot`

Records the boxes now and returns `{ animate(options?) }`, for when the DOM change happens elsewhere (a framework render). Call `animate` after the change.

```ts
import { snapshot } from "@damped/core";

const items = [...document.querySelectorAll<HTMLElement>("li")];

const before = snapshot(items);
// ...change the DOM...
before.animate({ duration: 0.4 });
```

### `measureLayout(element): Box`

The element's natural box in viewport coordinates, `{ x, y, width, height }`, with any inline transform cleared for the measurement and then restored.

### Options

`LayoutOptions` are the [spring options](#spring-options) plus `scheduler` and `reducedMotion` (not `from` or `driver`), and:

| Option | Meaning |
| --- | --- |
| `correct` | `"children"` or an array of elements whose size must not distort while the parent scales. Each gets `scale(1 / scaleX, 1 / scaleY)` with `transform-origin: 0 0` for the duration of the animation. |
| `radius` | A border radius in px that stays visually constant while the element scales. It is written as `r / scaleX` px `/` `r / scaleY` px during the animation and as `r` px at rest. |

### Assumptions and behavior

- The element is not rotated, its `scale` is `1` and its `transform-origin` is the center. Animating `x`, `y`, `scaleX` or `scaleY` of the same element yourself while a layout runs is not supported.
- A layout animation is a set of `animate` values, so interrupting one keeps position and velocity, and a size change rescales the velocity to the new size.
- Corrections of children and radius are removed when the element settles at its natural box. Calling `stop()` keeps them where it freezes.
- An element with a compositor animation is handed to the JS driver first, because the compositor's progress is invisible to measurements.

## morph

`morph(from, to, options?)` turns one element into another. `to` starts on the box of `from` and settles at its own box; `from` travels onto the box of `to`. Both elements stay in the DOM.

```ts
import { morph } from "@damped/core";

const card = document.querySelector<HTMLElement>(".card")!;
const dialog = document.querySelector<HTMLElement>(".dialog")!;

dialog.hidden = false; // visible and laid out at its final box before morph() measures it
const controls = morph(card, dialog, { duration: 0.5, bounce: 0.1, radius: 16 });

// Reverse at any point: the same call with the arguments swapped.
const reverse = () => morph(dialog, card, { duration: 0.5, bounce: 0.1, radius: 16 });

const settled = await controls.finished; // true unless a later morph or stop() cut it short
```

### Preconditions

- Both elements are visible and laid out at their final boxes when `morph` is called. A `display: none` or `hidden` element has no box to measure, so show it first. `morph` throws a `RangeError` if it measures a non-finite box.
- The two elements must be different (`from === to` throws a `TypeError`).
- All the assumptions of [layout](#assumptions-and-behavior) apply to both elements.

### Options

`MorphOptions` are the `LayoutOptions` plus:

| Option | Default | Meaning |
| --- | --- | --- |
| `correct` | `"children"` | Same as in `layout`. Morph corrects the children by default. |
| `crossfade` | `true` | Fades `to` in and `from` out. With perceptual options the incoming fade runs twice as fast as the outgoing one, so the combined opacity does not dip in the middle; with physical options both fades use that spring. |
| `blur` | `8` | Blur in px on the corrected content children while they swap: incoming from `blur` to `0`, outgoing from `0` to `blur`. `0` turns it off. |

### Behavior

- While it runs, a morph owns `x`, `y`, `scaleX`, `scaleY` and (unless `crossfade` is `false`) `opacity` of both elements, and the blur of their corrected children.
- `finished` resolves `true` if this morph settled and `false` if a later morph or `stop()` on either element superseded it. It never rejects.
- Calling `morph(to, from)` while one runs reverses it. The elements keep their velocity, so the reversal turns around smoothly from wherever they are.
- A morph that fails its checks does not cut the one that is running.
- `stop()` freezes both elements where they are.

## Presence: enter and exit

`enter` and `exit` are `animate` with presence semantics: an element can leave and come back without a jump.

```ts
import { enter, exit } from "@damped/core";

const toast = document.querySelector<HTMLElement>(".toast")!;

// From invisible and 12 px low, to the identity values.
await enter(toast, { opacity: 0, y: 12 }, {}, { duration: 0.3, bounce: 0 }).finished;

// To invisible, then removed from the DOM.
const leaving = exit(toast, { opacity: 0, y: -12 }, { duration: 0.3, bounce: 0 });
const completed = await leaving.finished; // true, or false if enter() or another exit() interrupted it
```

### `enter(target, from, to = {}, options = {}): AnimationControls`

Jumps to `from`, then animates each property in `from` to its identity value (`x`, `y`, `rotate`, `blur` to `0`; `scale`, `scaleX`, `scaleY`, `opacity` to `1`), or to the value in `to` when you give one. `options` are the spring options plus `scheduler` and `reducedMotion`.

An element that is already moving on one of those properties, for example one that is exiting, is only retargeted. It keeps its position and velocity, and the properties its exit was animating return to their identity values.

### `exit(target, to, options = {}): { finished: Promise<boolean>; stop(): void }`

Animates to `to`. When it settles without being interrupted, it handles the element according to `remove`:

| `remove` | After the exit settles |
| --- | --- |
| `true` (default) | The element is removed from the DOM. |
| `false` | The element stays. |
| a function | The function is called with the element instead. If it throws, the exit still counts as completed and the error is rethrown from a microtask. |

- While an element exits it gets `inert` and `aria-hidden="true"`, so it cannot be focused or announced. With `remove: false` or a function, and when an exit is interrupted, the values it had before are restored.
- `finished` resolves `true` when the exit completed and `false` when a later `enter`, `exit`, `stop()` or a direct `animate` on the same properties interrupted it.
- `options` are the spring options plus `from`, `scheduler`, `reducedMotion` and `remove` (not `driver`).

## Reduced motion

Every API that moves an element follows the same rule: **spatial motion jumps, fades remain.**

| API | With reduced motion |
| --- | --- |
| `animate` | `x`, `y`, `rotate`, `scale`, `scaleX` and `scaleY` jump to their target; `opacity` and `blur` animate. |
| `animate` with `compositor` | The same rule, applied before the driver is involved. |
| `layout`, `snapshot` | The element jumps to its new box. |
| `morph` | The boxes jump; the crossfade and the blur still animate. |
| `enter`, `exit` | Spatial targets jump; opacity animates. An exit that only has spatial targets completes at once. |
| `createSpring`, `createSpringValue` | Not affected: they are numbers, not elements. Decide in your own code. |

The `reducedMotion` option decides when the rule applies:

| Value | Meaning |
| --- | --- |
| `"user"` (default) | `matchMedia("(prefers-reduced-motion: reduce)")` at the time of the call. Without `matchMedia` it is off. |
| `"always"` | Always reduce. Useful for an in-app setting or a test. |
| `"never"` | Never reduce. |

## Testing

Give a scheduler a fake `FrameSource` and drive it by hand. Nothing waits for real time.

```ts
import { animate, createScheduler, type FrameSource } from "@damped/core";

function createManualFrames() {
  let next = 1;
  const queue = new Map<number, (timestamp: number) => void>();
  const source: FrameSource = {
    request(callback) {
      queue.set(next, callback);
      return next++;
    },
    cancel: (handle) => void queue.delete(handle),
  };
  return {
    source,
    flush(timestamp: number) {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback(timestamp);
    },
  };
}

const frames = createManualFrames();
const scheduler = createScheduler(frames.source);

const box = document.createElement("div");
animate(box, { x: 100 }, { scheduler, duration: 0.5 });

frames.flush(0); // the first frame is t = 0
frames.flush(100); // 100 ms later
console.log(box.style.transform); // translate3d(…px, 0px, 0) rotate(0deg) scale(1, 1), part of the way to 100
```

The package's own tests use this approach with happy-dom (`bunfig.toml` preloads it), and the browser behavior is checked separately with Playwright.

## Exported types

| Type | What it is |
| --- | --- |
| `SpringOptions` | Perceptual or physical spring options. |
| `SpringParams` | `{ stiffness, damping, mass }`. |
| `SpringState` | `{ position, velocity }`. |
| `Spring` | The result of `createSpring`. |
| `FrameInfo` | `{ timestamp, delta }` passed to scheduler jobs. |
| `FrameSource` | `{ request, cancel }`, what drives a scheduler. |
| `Phase` | `"read" \| "update" \| "write"`. |
| `FrameJob` | `(frame: FrameInfo) => void`. |
| `Scheduler` | `{ schedule, loop, active }`. |
| `SpringValue`, `SpringValueOptions` | A `createSpringValue` result and its options. |
| `AnimatableProperty` | `"x" \| "y" \| "scale" \| "scaleX" \| "scaleY" \| "rotate" \| "opacity" \| "blur"`. |
| `AnimationTargets` | `Partial<Record<AnimatableProperty, number>>`. |
| `AnimateOptions` | Spring options plus `scheduler`, `reducedMotion`, `from` and `driver`. |
| `AnimationControls` | `{ finished: Promise<void>; stop(): void }`. |
| `Driver` | The interface of `compositor`. |
| `Box` | `{ x, y, width, height }` in viewport coordinates. |
| `LayoutOptions`, `LayoutSnapshot` | Options of `layout` and `snapshot().animate`, and the object `snapshot` returns. |
| `MorphOptions`, `MorphControls` | Options of `morph` and its `{ finished: Promise<boolean>; stop() }`. |
| `EnterOptions`, `ExitOptions` | Options of `enter` and `exit`. |

## Browser support

- The package is ES modules with no dependencies and no polyfills. It is tested in Chromium with Playwright; other engines are not part of the test suite.
- The Web Animations API is optional: it is only needed by the compositor driver, which falls back to the JS driver without it.
- `requestAnimationFrame`, `matchMedia` and `getComputedStyle` are all optional. Without them the scheduler uses a 16 ms timer, reduced motion is treated as off, and the initial opacity is taken as `1`.
- Importing the package on a server is safe. Nothing touches the DOM until an animation starts.

## License

MIT. See [LICENSE](./LICENSE).
