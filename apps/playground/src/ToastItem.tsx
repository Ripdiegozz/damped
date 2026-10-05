import { useLayout } from "@damped/react";
import { useCallback, useEffect, useRef, type FocusEvent, type Ref } from "react";
import { useMotion } from "./motion-context";
import { useMergedRef } from "./use-merged-ref";

export interface ToastAction {
  /** The visible text of the button, which is also its accessible name. */
  label: string;
  onAction(): void;
}

export interface ToastData {
  id: number;
  message: string;
  action?: ToastAction;
}

/** After a pause ends, a toast stays at least this long (or its whole duration, if that is shorter). */
const MIN_RESUME_MS = 1000;

interface ToastItemProps {
  toast: ToastData;
  /** How many toasts sit below this one in the stack. When it changes, this toast moved. */
  after: number;
  /**
   * Counts the toasts that finished leaving. It changes in the very render that removes one, while the DOM still shows
   * the old layout, so useLayout takes its snapshot there and springs the toast into the space that was freed.
   */
  reflowKey: number;
  /** How long the toast stays before it dismisses itself. */
  duration: number;
  onDismiss(id: number): void;
  /** Presence animates the element it receives through this ref (a prop in React 19). */
  ref?: Ref<HTMLDivElement>;
}

export function ToastItem({ toast, after, reflowKey, duration, onDismiss, ref }: ToastItemProps) {
  // Two things move a toast: one added below it pushes it up (`after`), and one that finished leaving frees space (`reflowKey`).
  const { spring } = useMotion();
  const layoutRef = useLayout<HTMLDivElement>([after, reflowKey], spring("stack"));
  const setNode = useMergedRef(layoutRef, ref);

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
      {toast.action !== undefined && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.onAction();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
