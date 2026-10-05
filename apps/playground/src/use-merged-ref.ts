import { useCallback, type Ref, type RefCallback } from "react";

/**
 * One ref callback that feeds an own callback and a ref received from outside (for <Presence>, a React 19 `ref` prop).
 * The returned cleanup tells both that the element is gone, and passes on a cleanup that the outside callback returned.
 */
export function useMergedRef<T extends Element>(own: RefCallback<T>, forwarded: Ref<T> | undefined): RefCallback<T> {
  return useCallback(
    (element: T | null) => {
      own(element);
      let cleanup: void | (() => void);
      if (typeof forwarded === "function") cleanup = forwarded(element);
      else if (forwarded) forwarded.current = element;
      return () => {
        own(null);
        if (typeof cleanup === "function") cleanup();
        else if (typeof forwarded === "function") forwarded(null);
        else if (forwarded) forwarded.current = null;
      };
    },
    [own, forwarded],
  );
}
