import { animate, compositor, type AnimationControls } from "@damped/core";
import { useEffect, useRef, useState } from "react";
import { MotionNote, useDemoState, useMotionPreference } from "./motion";

const SPRING = { duration: 1.3, bounce: 0.2 } as const;
const BALL_PX = 22;
const LANE_PADDING_PX = 10;
const HOLD_MS = 350;
const LEAD_IN_MS = 500;
const BLOCK_MS = 1000;

interface Loop {
  controls: AnimationControls[];
  /** Cuts the pause between two legs short. */
  wake: (() => void) | undefined;
}

/** Holds the main thread: no frame, timer or promise callback can run until it returns. */
function blockMainThread(ms: number): number {
  const begin = performance.now();
  while (performance.now() - begin < ms) {
    // Busy on purpose.
  }
  return performance.now() - begin;
}

/**
 * Two identical balls play the same spring back and forth. The top one is driven by damped's default JS frame
 * scheduler. The bottom one is handed to the browser's compositor through the opt-in `compositor` driver
 * (Web Animations API), so it keeps moving when the main thread is busy. "Block main thread" busy-loops for one
 * second: the JS ball freezes, then catches up; the compositor ball never stops.
 *
 * Reduced motion: damped makes both balls jump, so "Move" jumps them to the other end. "Play anyway" overrides it
 * for this demo, because the comparison is the whole point.
 */
export function CompositorVsJs() {
  const root = useRef<HTMLDivElement>(null);
  const jsLane = useRef<HTMLDivElement>(null);
  const jsBall = useRef<HTMLSpanElement>(null);
  const compositorBall = useRef<HTMLSpanElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const [running, setRunning] = useState(false);
  const loop = useRef<Loop | undefined>(undefined);
  const atEnd = useRef(false);
  const latest = useRef(motion);
  latest.current = motion;
  // The pending "Block main thread" (a frame, then the lead-in). Cancelled on unmount and when pressed again.
  const pendingBlock = useRef<{ frame: number; timer: ReturnType<typeof setTimeout> | undefined } | undefined>(undefined);

  const cancelBlock = (): void => {
    const pending = pendingBlock.current;
    pendingBlock.current = undefined;
    if (pending === undefined) return;
    cancelAnimationFrame(pending.frame);
    clearTimeout(pending.timer);
  };

  const stop = (): void => {
    const current = loop.current;
    loop.current = undefined;
    current?.wake?.();
    for (const controls of current?.controls ?? []) controls.stop();
  };

  useEffect(
    () => () => {
      cancelBlock();
      stop();
    },
    [],
  );

  const leg = (): AnimationControls[] => {
    const lane = jsLane.current;
    const js = jsBall.current;
    const fast = compositorBall.current;
    if (lane === null || js === null || fast === null) return [];
    const distance = Math.max(0, lane.clientWidth - BALL_PX - 2 * LANE_PADDING_PX);
    atEnd.current = !atEnd.current;
    const to = atEnd.current ? distance : 0;
    const reducedMotion = latest.current.option;
    return [
      animate(js, { x: to }, { ...SPRING, reducedMotion }),
      animate(fast, { x: to }, { ...SPRING, reducedMotion, driver: compositor }),
    ];
  };

  const start = (): void => {
    if (loop.current !== undefined) return;
    const state: Loop = { controls: [], wake: undefined };
    loop.current = state;
    setRunning(true);
    tracker.begin();
    void (async () => {
      do {
        state.controls = leg();
        await Promise.all(state.controls.map((controls) => controls.finished));
        if (loop.current !== state) break;
        await new Promise<void>((resolve) => {
          state.wake = resolve;
          setTimeout(resolve, HOLD_MS);
        });
      } while (loop.current === state && !latest.current.still);
      if (loop.current === state) {
        loop.current = undefined;
        setRunning(false);
      }
      tracker.settle();
    })();
  };

  const toggle = (): void => {
    if (loop.current === undefined) {
      start();
      return;
    }
    // The loop ends itself: it clears `running` and settles the demo once the stopped legs report back.
    stop();
    setRunning(false);
  };

  const block = (): void => {
    if (loop.current === undefined) start();
    const text = status.current;
    if (text) text.textContent = "Blocking the main thread for one second. Watch the two balls.";
    // After a frame and the lead-in, so the balls are visibly moving and the message was painted.
    cancelBlock();
    const pending: { frame: number; timer: ReturnType<typeof setTimeout> | undefined } = { frame: 0, timer: undefined };
    pendingBlock.current = pending;
    pending.frame = requestAnimationFrame(() => {
      pending.timer = setTimeout(() => {
        pendingBlock.current = undefined;
        const took = blockMainThread(BLOCK_MS);
        root.current?.setAttribute("data-block-ms", String(Math.round(took)));
        if (text) {
          const result = latest.current.still
            ? "Reduced motion is on, so nothing was moving. Use Play anyway to compare."
            : "The compositor ball kept moving; the JS ball froze and then caught up.";
          text.textContent = `The main thread was blocked for ${Math.round(took)} ms. ${result}`;
        }
      }, LEAD_IN_MS);
    });
  };

  return (
    <div ref={root} className="not-content demo" data-demo="compositor-vs-js" data-state="idle" data-runs="0" role="group" aria-label="JS driver compared with the compositor driver">
      <p className="demo-title">Compositor driver vs JS driver</p>
      <div className="demo-actions">
        <button type="button" className="demo-button demo-button--primary" aria-pressed={running} onClick={toggle}>
          {running ? "Stop" : motion.still ? "Move" : "Start"}
        </button>
        <button type="button" className="demo-button demo-button--danger" onClick={block}>
          Block main thread (1 s)
        </button>
      </div>
      <div className="compare-lane" ref={jsLane} data-lane="js">
        <span className="compare-label">JS driver: the frame scheduler (default)</span>
        <span ref={jsBall} className="compare-ball compare-ball--js" data-ball="js" aria-hidden="true" />
      </div>
      <div className="compare-lane" data-lane="compositor">
        <span className="compare-label">Compositor driver: Web Animations API (opt-in)</span>
        <span ref={compositorBall} className="compare-ball compare-ball--compositor" data-ball="compositor" aria-hidden="true" />
      </div>
      <p ref={status} className="demo-status" aria-live="polite">
        Start the balls, then block the main thread.
      </p>
      <MotionNote preference={motion} canPlay>
        Both balls jump to the other end, so there is nothing to compare. Play anyway to run the comparison.
      </MotionNote>
    </div>
  );
}
