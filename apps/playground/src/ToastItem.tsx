import { useLayout } from "@damped/react";
import { snapshot } from "damped";
import { useCallback, useEffect, useLayoutEffect, useRef, type FocusEvent, type RefObject, type Ref } from "react";
import { SPRINGS } from "./motion";

export interface ToastData {
  id: number;
  message: string;
}

/** After a pause ends, a toast stays at least this long (or its whole duration, if that is shorter). */
const MIN_RESUME_MS = 1000;

interface ToastItemProps {
  toast: ToastData;
  /** How many toasts sit below this one in the stack. When it changes, this toast moved. */
  after: number;
  /** How long the toast stays before it dismisses itself. */
  duration: number;
  /** Ids of the toasts that are not leaving. */
  live: RefObject<ReadonlySet<number>>;
  onDismiss(id: number): void;
  /** Presence animates the element it receives through this ref (a prop in React 19). */
  ref?: Ref<HTMLDivElement>;
}

/**
 * The toasts that stay move into the space a leaving toast gives up. <Presence> keeps a leaving toast in the flow until
 * its exit settles and only then removes it, in a render of its own whose props do not change, so useLayout (which
 * watches its deps) cannot see that commit. This runs in the cleanup of the removed toast, the last moment the
 * others are still where they were, and plays the move once the removal has been committed.
 */
function reflowOthers(removed: HTMLElement | null, live: ReadonlySet<number>): void {
  const stack = removed?.parentElement;
  if (stack == null) return;
  // A toast that is itself leaving is mid-exit: moving it would cut the exit and it would never be removed.
  const staying = [...stack.children].filter((child) => child !== removed && live.has(Number(child.getAttribute("data-toast-id"))));
  if (staying.length === 0) return;
  const before = snapshot(staying);
  queueMicrotask(() => before.animate(SPRINGS.stack));
}

export function ToastItem({ toast, after, duration, live, onDismiss, ref }: ToastItemProps) {
  // A toast added below pushes this one up: the deps change in the render that adds it, which is what useLayout needs.
  const layoutRef = useLayout<HTMLDivElement>([after], SPRINGS.stack);
  const node = useRef<HTMLDivElement | null>(null);

  const setNode = useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      layoutRef(element);
      let cleanup: void | (() => void);
      if (typeof ref === "function") cleanup = ref(element);
      else if (ref) ref.current = element;
      return () => {
        node.current = null;
        layoutRef(null);
        if (typeof cleanup === "function") cleanup();
        else if (typeof ref === "function") ref(null);
        else if (ref) ref.current = null;
      };
    },
    [layoutRef, ref],
  );

  useLayoutEffect(() => {
    const element = node.current;
    return () => reflowOthers(element, live.current ?? new Set());
  }, [live]);

  // The dismissal timer pauses while the pointer is over the toast or focus is inside it, and resumes with what was left.
  const timer = useRef({ id: undefined as number | undefined, remaining: duration, startedAt: 0, hovered: false, focused: false });
  const resume = useCallback(() => {
    const state = timer.current;
    if (state.id !== undefined || state.hovered || state.focused) return;
    state.startedAt = performance.now();
    state.id = window.setTimeout(() => onDismiss(toast.id), state.remaining);
  }, [onDismiss, toast.id]);
  const pause = useCallback(() => {
    const state = timer.current;
    if (state.id === undefined) return;
    window.clearTimeout(state.id);
    state.id = undefined;
    state.remaining = Math.max(state.remaining - (performance.now() - state.startedAt), Math.min(MIN_RESUME_MS, duration));
  }, [duration]);

  useEffect(() => {
    resume();
    return () => window.clearTimeout(timer.current.id);
  }, [resume]);

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    timer.current.focused = false;
    resume();
  };

  return (
    <div
      className="toast"
      ref={setNode}
      role="status"
      aria-live="polite"
      data-toast-id={toast.id}
      onMouseEnter={() => {
        timer.current.hovered = true;
        pause();
      }}
      onMouseLeave={() => {
        timer.current.hovered = false;
        resume();
      }}
      onFocus={() => {
        timer.current.focused = true;
        pause();
      }}
      onBlur={onBlur}
    >
      <span className="toast-mark" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
      <p className="toast-message">{toast.message}</p>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
