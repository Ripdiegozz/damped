# @damped/react

React hooks for [damped](../core) springs. Values reach the DOM through damped, never through React state: nothing re-renders per animation frame, and state changes only on discrete events.

Requires React 19 and `damped` as peers.

```sh
bun add @damped/react damped
```

## `useSpringValue`

A spring value that lives as long as the component. It is created once, stops on unmount and drops its listeners. It never renders by itself.

```tsx
const progress = useSpringValue(0);
useEffect(() => progress.onChange((value) => (bar.current!.style.width = `${value}%`)), [progress]);
onClick = () => progress.set(100, { duration: 0.4, bounce: 0.2 });
```

## `useSpring`

Springs an element toward `targets`. A change of any target value (compared by value, not identity) retargets the running animation and keeps its velocity. `options` are read at that moment; changing them alone does nothing.

```tsx
function Card({ active }: { active: boolean }) {
  const ref = useSpring<HTMLDivElement>({ scale: active ? 1.05 : 1, opacity: active ? 1 : 0.6 }, { duration: 0.4 });
  return <div ref={ref}>Card</div>;
}
```

## `useLayout`

FLIP on re-render: when `deps` change, the element animates from the box it had before the commit to its new layout.

```tsx
function List({ expanded }: { expanded: boolean }) {
  const ref = useLayout<HTMLDivElement>([expanded], { correct: "children" });
  return <div ref={ref} className={expanded ? "large" : "small"}>…</div>;
}
```

The previous box is read during render, the last moment the DOM still shows it. That is a deliberate trade-off (react-flip-toolkit and Motion's projection snapshot before the commit too). Renders React discards are harmless: each render replaces the snapshot, and a snapshot only animates the commit of the render that took it.
