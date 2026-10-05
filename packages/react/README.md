# @damped/react

React hooks and a component for [`@damped/core`](../core) springs. Animated values reach the DOM through refs, never through React state, so nothing re-renders per animation frame.

```sh
bun add @damped/react @damped/core react react-dom   # npm install / pnpm add work the same way
```

> `@damped/react` is not published to npm yet. Until it is, use it from this repository's workspace.

Peer dependencies: React 19 (`react`, `react-dom`) and `@damped/core`.

## Quick start

```tsx
import { useSpring } from "@damped/react";

function Card({ active }: { active: boolean }) {
  const ref = useSpring<HTMLDivElement>({ scale: active ? 1.05 : 1, opacity: active ? 1 : 0.6 }, { duration: 0.4 });
  return <div ref={ref}>Card</div>;
}
```

When `active` changes, the card springs to the new values. If it changes again mid-flight, the new spring starts from the position and velocity of the old one. The component renders on the prop change only.

## What is in the package

| Export | Kind | Use it to |
| --- | --- | --- |
| [`useSpringValue`](#usespringvalue) | hook | Hold a spring-driven number for the life of a component. |
| [`useSpring`](#usespring) | hook | Spring an element toward target styles. |
| [`useLayout`](#uselayout) | hook | Animate an element from its old box to its new one when something changed (FLIP). |
| [`useMorph`](#usemorph) | hook | Turn a card into a dialog, and back. |
| [`<Presence>`](#presence) | component | Animate children in when they are added and out before they are removed. |

All options are the [`@damped/core` options](../core/README.md#spring-options); a few of them are repeated where they matter.

## The render guarantee

The animation frames never go through React. This is what re-renders, and when:

| Hook or component | Renders |
| --- | --- |
| `useSpringValue` | Never, by itself. Subscribe with `onChange` or read it in an event handler. |
| `useSpring` | Never, by itself. |
| `useLayout` | Never, by itself. It reads the DOM during your render and animates after the commit. |
| `useMorph` | Once when `open()` is called (`isOpen` becomes `true`) and once when `close()` is called. Never per frame. |
| `<Presence>` | When the set of children changes, plus one more render when a leaving child is dropped after its exit. Never per frame. |

This is covered by tests that count the renders of a component across hundreds of animation frames.

## useSpringValue

```ts no-check
useSpringValue(initial: number, options?: SpringValueOptions): SpringValue
```

A spring value that lives as long as the component. It is created once (`initial` and `options` of later renders are ignored), stops on unmount and drops the listeners that were subscribed through it.

```tsx
import { useEffect, useRef } from "react";
import { useSpringValue } from "@damped/react";

function Meter() {
  const bar = useRef<HTMLDivElement>(null);
  const level = useSpringValue(0);

  // The frames are written to the DOM here, not through state.
  useEffect(() => level.onChange((value) => (bar.current!.style.width = `${value}%`)), [level]);

  return (
    <>
      <div className="meter" ref={bar} />
      <button onClick={() => void level.set(80, { duration: 0.4, bounce: 0.2 })}>Fill</button>
    </>
  );
}
```

The returned object is the [`SpringValue`](../core/README.md#createspringvalue) of the core: `get`, `getVelocity`, `animating`, `set`, `jump`, `stop`, `rebase` and `onChange`. `SpringValueOptions` is `{ scheduler?, restDelta?, restSpeed? }`.

## useSpring

```ts no-check
useSpring<T extends Element>(targets: AnimationTargets, options?: AnimateOptions): RefCallback<T>
```

Springs the element that receives the returned ref toward `targets`. Properties are `x`, `y`, `scale`, `scaleX`, `scaleY`, `rotate`, `opacity` and `blur`, as in [`animate`](../core/README.md#animate).

| Behavior | Detail |
| --- | --- |
| Retargeting | A change of any target value, compared by value and not by object identity, retargets the running animation and keeps its velocity. A new object with the same values does nothing. |
| Options | Read at the moment a retarget happens. Changing `options` alone does not restart anything. |
| First mount | The element animates from its current style to `targets`; it does not start at them. |
| Elements that mount later | An element that receives the ref after the component's last commit is animated as well. |
| Unmount | The animation stops. |

To start from a given style on the first mount, pass `from`. Because options are read on every retarget, apply it only the first time:

```tsx
import { useEffect, useRef } from "react";
import { useSpring } from "@damped/react";

function Progress({ ratio }: { ratio: number }) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);

  const fill = useSpring<HTMLDivElement>(
    { scaleX: ratio },
    { duration: 0.6, ...(mounted.current ? {} : { from: { scaleX: 0 } }) },
  );

  return (
    <div className="track">
      <div className="fill" ref={fill} style={{ transformOrigin: "left" }} />
    </div>
  );
}
```

## useLayout

```ts no-check
useLayout<T extends Element>(deps: readonly unknown[], options?: LayoutOptions): RefCallback<T>
```

FLIP on re-render: when `deps` change (compared with `Object.is`, item by item), the element animates from the box it had before the commit to its new layout.

```tsx
import { useLayout } from "@damped/react";

function Panel({ expanded }: { expanded: boolean }) {
  const ref = useLayout<HTMLDivElement>([expanded], { duration: 0.4, correct: "children" });
  return (
    <div ref={ref} className={expanded ? "large" : "small"}>
      <p>Content keeps its size while the panel scales.</p>
    </div>
  );
}
```

`options` are the [layout options](../core/README.md#layout-flip): the spring options, `correct` (children that must not distort), `radius` (a border radius that stays constant) and `scheduler` / `reducedMotion`.

Behavior:

- The first render does not animate; there is no earlier box.
- The previous box is read during render, which is the last moment the DOM still shows it. That is a deliberate trade-off: render is the last moment the DOM still shows the old layout, and react-flip-toolkit and Motion's projection also take their snapshot before the commit.
- Renders that React discards are harmless. Each render replaces the snapshot, a render whose deps match the last commit clears it, and a snapshot only animates the commit of the render that took it.
- Layout is read only in renders where `deps` changed. Renders where they did not change read nothing.
- The element must obey the [layout assumptions](../core/README.md#assumptions-and-behavior): not rotated, `scale` 1, transform origin at the center.

## useMorph

```ts no-check
useMorph(options?: MorphOptions): MorphHandle

interface MorphHandle {
  source: RefCallback<HTMLElement>;
  target: RefCallback<HTMLElement>;
  open(): Promise<boolean>;
  close(): Promise<boolean>;
  isOpen: boolean;
}
```

A card-to-dialog morph where both elements stay mounted. Attach `source` to the always-visible card and `target` to the dialog.

```tsx
import { useRef } from "react";
import { useMorph } from "@damped/react";

function Photo() {
  const { source, target, open, close, isOpen } = useMorph({ duration: 0.5, bounce: 0.1, radius: 16 });
  const card = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        ref={(node) => {
          card.current = node;
          source(node);
        }}
        aria-expanded={isOpen}
        onClick={() => void open()}
      >
        Photo
      </button>

      <div ref={target} role="dialog" aria-modal="true" aria-label="Photo">
        <button onClick={() => void close().then((settled) => settled && card.current?.focus())}>Close</button>
      </div>
    </>
  );
}
```

| Member | Meaning |
| --- | --- |
| `source`, `target` | Refs for the card and the dialog. |
| `open()` | Shows the target, then morphs the source into it. Resolves `true` when the morph settled and `false` when a later `open()` / `close()` or an unmount cut it. Rejects if the morph itself throws (for example, a non-finite box). Resolves `false` at once if either ref is not attached. |
| `close()` | Morphs the target back into the source and hides the target again once that settled. Same resolution as `open()`. Calling it while closed returns the running promise, or `true`. |
| `isOpen` | The only state. It changes when `open()` or `close()` is called, never per frame. |

Rules:

- **Do not render a `hidden` prop on the target.** While closed, the hook keeps it hidden with the DOM `hidden` attribute, written during the commit, so it never flashes. `open()` unhides it before measuring.
- **The geometry `morph` measures must not depend on `isOpen`.** It is read synchronously inside `open()`, before React re-renders. Keep the dialog's size and position independent of whether it is open.
- Author CSS that sets `display` on the target overrides `hidden`. Add `[hidden] { display: none !important; }` if yours does.
- Interrupting either direction reverses the morph and keeps its velocity. `open()` while closing reopens from where the dialog is.
- `options` are the [`morph` options](../core/README.md#morph). They are read on every commit, so changing them takes effect on the next `open()` or `close()`.
- On unmount the running morph stops.
- A dialog needs the usual dialog behavior (focus into it, a focus trap, Escape, focus back to the card). The hook handles motion only. The [bills view of the playground](../../apps/playground/src/BillCard.tsx) is a complete example, including a portal to `document.body` (a transformed ancestor would otherwise become the containing block of a fixed dialog).

## Presence

```ts no-check
function Presence(props: PresenceProps): ReactElement

interface PresenceProps {
  enter?: AnimationTargets;
  exit?: AnimationTargets;
  options?: EnterOptions;
  initial?: boolean;
  onExitComplete?: (key: Key) => void;
  children?: ReactNode;
}
```

Keeps removed children mounted until their `exit` animation settles, then drops them.

```tsx
import type { Ref } from "react";
import { Presence } from "@damped/react";

interface ToastData {
  id: string;
  text: string;
}

// A component child must pass the `ref` prop on to an element (React 19 passes it as a prop).
function Toast({ toast, ref }: { toast: ToastData; ref?: Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} role="status">
      {toast.text}
    </div>
  );
}

function Toasts({ toasts }: { toasts: ToastData[] }) {
  return (
    <Presence enter={{ opacity: 0, y: 16 }} exit={{ opacity: 0, x: 24 }} options={{ duration: 0.3, bounce: 0 }}>
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </Presence>
  );
}
```

| Prop | Default | Meaning |
| --- | --- | --- |
| `enter` | none | Where an added child starts. It animates to its identity values. Without it, added children appear at once. |
| `exit` | none | Where a removed child goes before it is dropped. Without it, removed children disappear at once. |
| `options` | core defaults | Spring options, `scheduler` and `reducedMotion`, used for both directions. |
| `initial` | `false` | Also animate the children present on the first mount. |
| `onExitComplete` | none | Called once with the key of every child that left. See below. |
| `children` | none | Keyed elements. |

### Rules for children

- Every child must have a `key`. A missing key throws a `TypeError`, in development and in production, because index keys would make an exit animation play on the wrong child. Two children with the same key throw as well, naming the key. Text children throw.
- A child is a host element or a component that passes the `ref` prop on to an element. Your own `ref` on a child still receives the element, including a ref callback that returns a cleanup function.
- A removed child whose element cannot be reached (a component that ignores `ref`) is dropped at once instead of hanging.
- Exiting children keep their position among the remaining ones, and stay in the layout flow until they are gone. While exiting, a child is `inert` and `aria-hidden="true"`.
- If the same key comes back during its exit, the exit is interrupted and the child stays, keeping its velocity.
- Children present when `<Presence>` first mounts do not animate in, unless `initial` is set.

### onExitComplete

```ts no-check
onExitComplete?: (key: Key) => void
```

Called once for every child that leaves.

| How the child left | When it is called |
| --- | --- |
| It animated out | In the same batch as the render that removes it. The child is still in the DOM when the callback runs, and state set from it re-renders together with the removal. |
| It left without an animation (no `exit` targets, or an element that could not take the ref) | Right after the commit that removed it. |
| Its exit was interrupted because the key came back | Not called. |
| `<Presence>` unmounted | Not called. |

The first case is what makes this useful for reflow. A layout snapshot taken in the render that the callback causes still sees the old layout, so a counter bumped in `onExitComplete` can drive `useLayout` on the siblings, which then spring into the space the child leaves:

```tsx
import { useState, type Ref } from "react";
import { Presence, useLayout } from "@damped/react";

interface Item {
  id: string;
  label: string;
}

function Row({ item, reflowKey, ref }: { item: Item; reflowKey: number; ref?: Ref<HTMLLIElement> }) {
  const layoutRef = useLayout<HTMLLIElement>([reflowKey], { duration: 0.4 });
  return (
    <li
      ref={(node) => {
        layoutRef(node);
        if (typeof ref === "function") return ref(node);
        if (ref) ref.current = node;
      }}
    >
      {item.label}
    </li>
  );
}

function List({ items }: { items: Item[] }) {
  const [gone, setGone] = useState(0);
  return (
    <ul>
      <Presence exit={{ opacity: 0, x: 24 }} onExitComplete={() => setGone((count) => count + 1)}>
        {items.map((item) => (
          <Row key={item.id} item={item} reflowKey={gone} />
        ))}
      </Presence>
    </ul>
  );
}
```

The playground's [toast stack](../../apps/playground/src/ToastProvider.tsx) and [activity list](../../apps/playground/src/ActivityView.tsx) use this, with a [small hook](../../apps/playground/src/use-merged-ref.ts) to merge the two refs.

## Reduced motion

`reducedMotion` is a core option, so every hook that takes options accepts it, and so does `<Presence options>`. The rule is the core's: spatial motion jumps and fades remain. See [Reduced motion](../core/README.md#reduced-motion). `useSpringValue` is not an element and is not affected; check `matchMedia("(prefers-reduced-motion: reduce)")` yourself if you animate a number.

## Server rendering

- Every hook and `<Presence>` render on the server without touching `window`, `document`, `requestAnimationFrame`, `matchMedia` or `getComputedStyle`. This is checked by rendering with those globals replaced by traps, and in a process with no DOM.
- The effects that start animations never run on the server: the layout effect is a no-op there.
- `useMorph` writes `hidden` on the client only, so server-rendered HTML shows the target until hydration. Hide it in CSS if that matters.
- `<Presence>` renders its children as they are; nothing animates until the client takes over.

## StrictMode

StrictMode's double render and simulated unmount and remount are covered by tests for `<Presence>` (a child enters once), `useLayout` (a single, correct animation) and `useMorph` (it still opens and closes). `useSpring` and `useSpringValue` clean up what they applied when an effect is torn down, so a remount starts over, but they have no StrictMode test of their own.

## Testing

Pass a `scheduler` option backed by a manual frame source to run animations in tests without waiting for time. See [Testing](../core/README.md#testing) in the core README. The package's own tests do this with happy-dom.

## Exported types

| Type | What it is |
| --- | --- |
| `MorphHandle` | The object `useMorph` returns. |
| `PresenceProps` | The props of `<Presence>`. |

The option and target types (`AnimationTargets`, `AnimateOptions`, `LayoutOptions`, `MorphOptions`, `EnterOptions`, `SpringValue`, `SpringValueOptions`) come from [`@damped/core`](../core/README.md#exported-types).

## Examples in this repository

Northbook, the [playground](https://damped.dagadev.net) in `apps/playground`, is built only on these hooks and the core:

| What | File |
| --- | --- |
| Card to dialog with `useMorph`, a backdrop with `useSpring`, a check badge pop | [`BillCard.tsx`](../../apps/playground/src/BillCard.tsx) |
| Counting numbers with `useSpringValue` | [`AnimatedNumber.tsx`](../../apps/playground/src/AnimatedNumber.tsx) |
| A progress bar with `useSpring` | [`ProgressBar.tsx`](../../apps/playground/src/ProgressBar.tsx) |
| A collapsible sidebar and a moving indicator with `useLayout` | [`Sidebar.tsx`](../../apps/playground/src/Sidebar.tsx) |
| Filtering and sorting rows with `useLayout` and `<Presence>` | [`ActivityView.tsx`](../../apps/playground/src/ActivityView.tsx) |

## License

MIT. See [LICENSE](./LICENSE).
