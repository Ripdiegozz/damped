import { createSpringValue, type SpringValue, type SpringValueOptions } from "damped";
import { useEffect, useRef } from "react";

interface Owned {
  value: SpringValue;
  dispose(): void;
}

// Wraps the value so the hook can drop the listeners it never subscribed itself when the component unmounts.
function own(initial: number, options: SpringValueOptions | undefined): Owned {
  const inner = createSpringValue(initial, options);
  const unsubscribes = new Set<() => void>();
  const value: SpringValue = {
    get: () => inner.get(),
    getVelocity: () => inner.getVelocity(),
    get animating() {
      return inner.animating;
    },
    set: (target, springOptions) => inner.set(target, springOptions),
    jump: (next) => inner.jump(next),
    rebase: (position, velocity) => inner.rebase(position, velocity),
    stop: () => inner.stop(),
    onChange(listener) {
      const unsubscribe = inner.onChange(listener);
      unsubscribes.add(unsubscribe);
      return () => {
        unsubscribes.delete(unsubscribe);
        unsubscribe();
      };
    },
  };
  return {
    value,
    dispose() {
      inner.stop();
      for (const unsubscribe of unsubscribes) unsubscribe();
      unsubscribes.clear();
    },
  };
}

/**
 * A spring value that lives as long as the component. It is created once (`initial` and `options` of later renders are
 * ignored) and never causes a render by itself: subscribe with `onChange` or read it from an event handler.
 */
export function useSpringValue(initial: number, options?: SpringValueOptions): SpringValue {
  const ref = useRef<Owned | null>(null);
  ref.current ??= own(initial, options);
  const owned = ref.current;
  useEffect(() => () => owned.dispose(), [owned]);
  return owned.value;
}
