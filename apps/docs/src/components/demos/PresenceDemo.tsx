import { createSpring, layout } from "@damped/core";
import { Presence } from "@damped/react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MotionNote, useDemoState, useMotionPreference } from "./motion";

interface Toast {
  id: number;
  text: string;
}

const MESSAGES = [
  "Payment sent to Jane Doe",
  "Bill paid: City Power",
  "Transfer received from John Doe",
  "Reminder: FiberNet is due Friday",
  "Receipt saved for Corner Grocery",
] as const;
const MAX_TOASTS = 4;
const SPRING = { duration: 0.4, bounce: 0.1 } as const;
const ENTER = { opacity: 0, y: 16, scale: 0.96 } as const;
const EXIT = { opacity: 0, x: 40 } as const;
// <Presence> reports no completion, so the demo derives when the longest move (40 px at damped's length thresholds) is over.
const SETTLE_MS = createSpring(0, 40, 0, { ...SPRING, restDelta: 0.01, restSpeed: 0.1 }).settleTime() * 1000 + 80;

/**
 * Toasts that enter and exit through `<Presence>`. A removed toast stays mounted until its exit settles; while it
 * leaves, damped marks it `inert`, which the stylesheet uses to take it out of the flow so the toasts below it
 * glide up through `layout()` instead of jumping.
 *
 * Reduced motion: toasts appear and disappear without moving; the fade stays.
 */
export function PresenceDemo() {
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const next = useRef(2);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [toasts, setToasts] = useState<Toast[]>([
    { id: 0, text: MESSAGES[0] },
    { id: 1, text: MESSAGES[1] },
  ]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  // Presence has no completion callback, so a timer derived from the spring ends the run.
  const watch = (): void => {
    tracker.begin();
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      tracker.settle();
    }, SETTLE_MS);
    timers.current.add(timer);
  };

  const add = (): void => {
    const id = next.current++;
    const toast = { id, text: MESSAGES[id % MESSAGES.length]! };
    watch();
    setToasts((current) => [...current, toast].slice(-MAX_TOASTS));
  };

  const remove = (id: number): void => {
    const rows = Array.from(list.current?.children ?? []);
    watch();
    // Committed before layout() measures: <Presence> marks the leaving toast inert within this commit.
    const controls = layout(rows, () => flushSync(() => setToasts((current) => current.filter((toast) => toast.id !== id))), SPRING);
    void tracker.track(controls.finished.then(() => true));
  };

  return (
    <div ref={root} className="not-content demo" data-demo="presence" data-state="idle" data-runs="0" role="group" aria-label="Toasts that enter and exit with Presence">
      <p className="demo-title">Enter and exit with Presence</p>
      <div className="demo-actions">
        <button type="button" className="demo-button demo-button--primary" onClick={add}>
          Add a toast
        </button>
        <button type="button" className="demo-button" disabled={toasts.length === 0} onClick={() => remove(toasts.at(-1)!.id)}>
          Remove the newest
        </button>
      </div>
      <div className="toast-stage">
      <ul ref={list} className="toast-list" aria-label="Notifications">
        <Presence enter={ENTER} exit={EXIT} options={SPRING}>
          {toasts.map((toast) => (
            <li key={toast.id} className="toast">
              <span className="toast-text">{toast.text}</span>
              <button type="button" className="toast-dismiss" aria-label={`Dismiss: ${toast.text}`} onClick={() => remove(toast.id)}>
                <span aria-hidden="true">&times;</span>
              </button>
            </li>
          ))}
        </Presence>
      </ul>
      {toasts.length === 0 && <p className="toast-empty">No notifications. Add one.</p>}
      </div>
      <MotionNote preference={motion}>Toasts appear and disappear without moving. Only the fade stays.</MotionNote>
    </div>
  );
}
