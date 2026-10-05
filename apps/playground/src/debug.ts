export interface DebugFlags {
  /** `?renders`: count renders of the bills grid and cards in `window.__renders`. */
  renders: boolean;
  /** `?toastMs=500`: auto-dismiss toasts after this many milliseconds instead of 4000. */
  toastMs: number | undefined;
  /** `?slow=6`: stretch the card-to-dialog morph by this factor, to look at it in mid-flight. */
  slow: number;
}

const MAX_TOAST_MS = 60_000;
const MAX_SLOW = 20;

/** Test hooks read from the query string. They are inert unless a flag is present. */
export function parseDebug(search: string): DebugFlags {
  const params = new URLSearchParams(search);
  const toast = Number(params.get("toastMs"));
  const slow = Number(params.get("slow"));
  return {
    renders: params.has("renders"),
    toastMs: Number.isInteger(toast) && toast > 0 && toast <= MAX_TOAST_MS ? toast : undefined,
    slow: Number.isFinite(slow) && slow >= 1 && slow <= MAX_SLOW ? slow : 1,
  };
}

export const DEBUG: DebugFlags = parseDebug(typeof location === "undefined" ? "" : location.search);

interface RenderCounts {
  __renders?: Record<string, number>;
}

/** Called in the body of a component: counts one render when `?renders` is set, and does nothing otherwise. */
export function countRender(name: string): void {
  if (!DEBUG.renders) return;
  const target = window as RenderCounts;
  const counts = (target.__renders ??= {});
  counts[name] = (counts[name] ?? 0) + 1;
}
