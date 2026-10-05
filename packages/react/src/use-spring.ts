import { animate, type AnimateOptions, type AnimationControls, type AnimationTargets } from "damped";
import { useRef, type RefCallback } from "react";
import { useIsomorphicLayoutEffect } from "./isomorphic";

interface Core<T extends Element> {
  element: Element | null;
  /** Props of the last commit; undefined before the first commit and after unmount. */
  latest: { targets: AnimationTargets; options: AnimateOptions | undefined } | undefined;
  /** What was last animated toward, and on which element. */
  applied: AnimationTargets | undefined;
  appliedElement: Element | null;
  controls: AnimationControls | undefined;
  ref: RefCallback<T>;
  sync(): void;
}

const definedEntries = (targets: AnimationTargets): [string, number][] =>
  Object.entries(targets).filter((entry): entry is [string, number] => entry[1] !== undefined);

function sameTargets(a: AnimationTargets, b: AnimationTargets): boolean {
  const left = definedEntries(a);
  const right = definedEntries(b);
  return left.length === right.length && left.every(([name, value]) => Object.is(b[name as keyof AnimationTargets], value));
}

function createCore<T extends Element>(): Core<T> {
  const core: Core<T> = {
    element: null,
    latest: undefined,
    applied: undefined,
    appliedElement: null,
    controls: undefined,
    ref(node) {
      core.element = node;
      // Reaches elements that mount after the component's last commit; during the first commit `latest` is still unset.
      core.sync();
    },
    sync() {
      const { element, latest } = core;
      if (element === null || latest === undefined) return;
      if (core.appliedElement === element && core.applied !== undefined && sameTargets(core.applied, latest.targets)) return;
      core.controls = animate(element, latest.targets, latest.options);
      core.applied = { ...latest.targets };
      core.appliedElement = element;
    },
  };
  return core;
}

/**
 * Springs the element toward `targets`. Values are written to the DOM by damped, never through React state, so the
 * component does not re-render while animating. A new set of target values (compared by value) retargets the running
 * animation and keeps its velocity; `options` are read at that moment, and changing them alone does nothing.
 */
export function useSpring<T extends Element>(targets: AnimationTargets, options?: AnimateOptions): RefCallback<T> {
  const holder = useRef<Core<T> | null>(null);
  holder.current ??= createCore<T>();
  const core = holder.current;

  useIsomorphicLayoutEffect(
    () => () => {
      // Also runs for StrictMode's simulated unmount: forgetting what was applied makes the re-run start over.
      core.controls?.stop();
      core.controls = undefined;
      core.applied = undefined;
      core.appliedElement = null;
      core.latest = undefined;
    },
    [core],
  );
  useIsomorphicLayoutEffect(() => {
    core.latest = { targets, options };
    core.sync();
  });

  return core.ref;
}
