# @damped/react

React hooks for [damped](../core) springs. Values reach the DOM through damped, never through React state: nothing re-renders per animation frame, and state changes only on discrete events.

Requires React 19 and `@damped/core` as peers.

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

## `useMorph`

A card-to-dialog morph where both elements stay mounted. While closed, the hook keeps the target hidden with the DOM `hidden` attribute (written during the commit, so it never flashes); render the target **without** a `hidden` prop. `open()` unhides it before measuring and morphs the source into it. `close()` morphs back and re-hides the target once that settled. Interrupting either one reverses the morph with its velocity.

```tsx
function Gallery() {
  const { source, target, open, close, isOpen } = useMorph({ duration: 0.5, bounce: 0.1 });
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
      <div ref={target} role="dialog" aria-modal="true">
        <button onClick={() => void close().then((settled) => settled && card.current?.focus())}>Close</button>
      </div>
    </>
  );
}
```

Notes:

- `isOpen` is the only state, and it changes on `open()` and `close()` only, never per frame. `open()` and `close()` resolve `true` when the morph settled and `false` when it was cut, so apps can move focus when they resolve.
- The geometry that `morph()` measures must not depend on `isOpen`: it is read synchronously, before React re-renders.
- Author CSS that sets `display` on the target overrides `hidden`. Add `[hidden] { display: none !important; }` if it does.
- Server-rendered HTML shows the target until hydration, because the hook writes `hidden` on the client.

## `<Presence>`

Keeps removed children mounted until their `exit` animation settles, then drops them (one re-render). Exiting children keep their position among the remaining ones. If the same key comes back during its exit, the exit is interrupted and the child stays, keeping its velocity.

```tsx
<Presence enter={{ opacity: 0, y: 12 }} exit={{ opacity: 0, y: -12 }} options={{ duration: 0.3 }}>
  {toasts.map((toast) => (
    <Toast key={toast.id} toast={toast} />
  ))}
</Presence>
```

- Children must be keyed elements, either host elements or components that pass the `ref` prop on to an element (React 19). A missing key throws, in development and in production, because index keys would make exit animations play on the wrong child. Your own `ref` on a child still receives the element.
- `enter` is where an added child starts (it animates to its identity values), `exit` is where a removed one goes. Without `exit`, removed children disappear at once.
- Children present when `<Presence>` first mounts do not animate in; pass `initial` to animate them too.
- `onExitComplete(key)` is called once for every child that leaves. After an exit animation it runs in the same batch as the render that removes the child, so the child is still in the DOM when it is called, and state set from it re-renders together with the removal. That is the moment to snapshot layout: bump a counter in `onExitComplete` and use it in the `deps` of `useLayout` on the siblings, so they spring into the space the child leaves. A child that leaves with no animation (no `exit` targets, or targets already equal to its values) is reported right after the commit that removed it. It is not called when the exit was interrupted (the key came back), or when `<Presence>` unmounted meanwhile.

```tsx
const [gone, setGone] = useState(0);
<Presence exit={{ opacity: 0, x: 24 }} onExitComplete={() => setGone((count) => count + 1)}>
  {items.map((item) => (
    <Row key={item.id} reflowKey={gone} />
  ))}
</Presence>;
// Row: const ref = useLayout([reflowKey]); the render the callback causes still sees the old layout.
```
