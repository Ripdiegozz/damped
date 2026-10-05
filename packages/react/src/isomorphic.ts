import { useLayoutEffect } from "react";

/** `useLayoutEffect` in the browser; on the server effects never run, so it is a no-op there (and warns nowhere). */
export const useIsomorphicLayoutEffect: typeof useLayoutEffect = typeof document === "undefined" ? () => {} : useLayoutEffect;
