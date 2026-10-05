import { snapshot, type LayoutOptions, type LayoutSnapshot } from "damped";
import { useRef, type RefCallback } from "react";
import { useIsomorphicLayoutEffect } from "./isomorphic";

interface Core<T extends Element> {
  element: Element | null;
  /** Deps of the last commit. */
  committed: readonly unknown[] | undefined;
  /** Box recorded by the latest render whose deps differ from `committed`. */
  pending: LayoutSnapshot | undefined;
  ref: RefCallback<T>;
}

const sameDeps = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

/**
 * FLIP on re-render: when `deps` change, the element animates from the box it had before the commit to its new
 * layout. Compositing is left to damped, so nothing here re-renders per frame.
 *
 * The previous box is read during render, because that is the last moment the DOM still shows it. Reading layout
 * there is a deliberate trade-off (react-flip-toolkit and Motion's projection snapshot before the commit as well).
 * It is harmless for renders React discards: each render replaces the snapshot, and a render whose deps match the
 * last commit clears it, so a snapshot only ever animates the commit of the render that took it.
 */
export function useLayout<T extends Element>(deps: readonly unknown[], options?: LayoutOptions): RefCallback<T> {
  const holder = useRef<Core<T> | null>(null);
  if (holder.current === null) {
    const created: Core<T> = {
      element: null,
      committed: undefined,
      pending: undefined,
      ref(node) {
        created.element = node;
      },
    };
    holder.current = created;
  }
  const core = holder.current;

  const changing = core.committed !== undefined && !sameDeps(core.committed, deps);
  core.pending = changing && core.element !== null ? snapshot(core.element) : undefined;

  useIsomorphicLayoutEffect(() => {
    const taken = core.pending;
    core.pending = undefined;
    const changed = core.committed !== undefined && !sameDeps(core.committed, deps);
    core.committed = [...deps];
    if (changed) taken?.animate(options);
  });

  return core.ref;
}
