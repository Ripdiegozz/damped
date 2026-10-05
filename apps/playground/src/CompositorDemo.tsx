import { animate, compositor } from "damped";
import { useRef } from "react";
import { useMotion } from "./motion-context";

const DOT_PX = 16;
const PADDING_PX = 8;
const BLOCK_MS = 300;
/** Long enough for the block to land in the middle of the run. */
const LEAD_IN_MS = 150;
const SPRING = { duration: 1.4, bounce: 0.15 } as const;

/** Holds the main thread in a loop: no frame, timer or promise callback can run until it ends. */
function blockMainThread(ms: number): { start: number; end: number } {
  const start = performance.timeOrigin + performance.now();
  const begin = performance.now();
  while (performance.now() - begin < ms) {
    // Busy on purpose.
  }
  return { start, end: performance.timeOrigin + performance.now() };
}

/**
 * Two dots run the same spring across a track. One is played by the compositor driver, the other by the JS driver. A
 * click blocks the main thread for 300 ms in the middle of the run: only the compositor dot keeps moving meanwhile.
 */
export function CompositorDemo() {
  const { settings } = useMotion();
  const track = useRef<HTMLDivElement>(null);
  const compositorDot = useRef<HTMLSpanElement>(null);
  const jsDot = useRef<HTMLSpanElement>(null);

  const run = () => {
    const [box, fast, slow] = [track.current, compositorDot.current, jsDot.current];
    if (box === null || fast === null || slow === null) return;
    box.removeAttribute("data-block-start");
    box.removeAttribute("data-block-end");
    const distance = box.clientWidth - DOT_PX - 2 * PADDING_PX;
    const reduced = settings.reducedMotion ? ({ reducedMotion: "always" } as const) : {};

    animate([fast, slow], { x: 0 }, { reducedMotion: "always" });
    animate(fast, { x: distance }, { ...SPRING, ...reduced, driver: compositor });
    animate(slow, { x: distance }, { ...SPRING, ...reduced });

    const block = () => {
      const { start, end } = blockMainThread(BLOCK_MS);
      // Read by the end-to-end test, which has to know when the block happened to look at the frames drawn during it.
      box.dataset.blockStart = String(start);
      box.dataset.blockEnd = String(end);
    };
    // Starts once the compositor animation is playing, or at once when there is none (reduced motion).
    const playing = fast.getAnimations()[0]?.ready ?? Promise.resolve();
    void playing.then(() => setTimeout(block, LEAD_IN_MS));
  };

  return (
    <div className="lab-demo">
      <h3>Compositor driver</h3>
      <div className="lab-track" ref={track} data-lab-track>
        <span className="lab-dot is-compositor" ref={compositorDot} data-dot="compositor" />
        <span className="lab-dot is-js" ref={jsDot} data-dot="js" />
      </div>
      <p className="lab-legend">
        <span className="swatch is-compositor" aria-hidden="true" /> Compositor <span className="swatch is-js" aria-hidden="true" /> JS driver
      </p>
      <button type="button" className="button" onClick={run}>
        Block main thread (300 ms)
      </button>
      <p className="lab-hint">
        The same spring runs twice. The green dot is played by the compositor, so it keeps moving while JavaScript is blocked; the dark dot
        is driven from animation frames and stops until they return.
      </p>
    </div>
  );
}
