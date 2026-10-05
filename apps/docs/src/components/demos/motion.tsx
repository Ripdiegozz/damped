import { useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createDemoState, writeDemoState, type DemoStateTracker } from "./demo-state";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const read = (): boolean => typeof matchMedia === "function" && matchMedia(QUERY).matches;
// The server has no preference to read; the client corrects it right after hydration.
const readOnServer = (): boolean => false;

/** `prefers-reduced-motion: reduce`, read only on the client (false while rendering on the server). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, readOnServer);
}

export interface MotionPreference {
  /** The operating system asks for reduced motion. */
  reduced: boolean;
  /** The visitor chose to see the motion anyway (only demos whose point is the motion offer this). */
  playAnyway: boolean;
  setPlayAnyway(next: boolean): void;
  /** The demo should jump instead of move. */
  still: boolean;
  /** Value for damped's `reducedMotion` option: follow the system, unless the visitor chose to play anyway. */
  option: "user" | "never";
}

export function useMotionPreference(): MotionPreference {
  const reduced = useReducedMotion();
  const [playAnyway, setPlayAnyway] = useState(false);
  return { reduced, playAnyway, setPlayAnyway, still: reduced && !playAnyway, option: playAnyway ? "never" : "user" };
}

/**
 * Owns the data-state contract of a demo root (see demo-state.ts). The tracker is created once and writes the
 * attributes straight to the DOM, so animation callbacks never cause a React render.
 */
export function useDemoState(root: RefObject<HTMLElement | null>): DemoStateTracker {
  const holder = useRef<DemoStateTracker | null>(null);
  holder.current ??= createDemoState((state, runs) => writeDemoState(root.current, state, runs));
  return holder.current;
}

interface MotionNoteProps {
  preference: MotionPreference;
  /** What the demo does while reduced motion is on, in one sentence. */
  children: string;
  /** Offer the explicit "Play anyway" control. Only for demos whose whole point is the motion. */
  canPlay?: boolean;
}

/** Visible only when the system asks for reduced motion. */
export function MotionNote({ preference, children, canPlay = false }: MotionNoteProps) {
  if (!preference.reduced) return null;
  return (
    <p className="demo-note" role="note">
      <span>
        <strong>Reduced motion is on.</strong> {children}
      </span>
      {canPlay && (
        <button
          type="button"
          className="demo-button"
          aria-pressed={preference.playAnyway}
          onClick={() => preference.setPlayAnyway(!preference.playAnyway)}
        >
          {preference.playAnyway ? "Stop playing anyway" : "Play anyway"}
        </button>
      )}
    </p>
  );
}
