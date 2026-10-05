import { useSpringValue } from "@damped/react";
import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { MotionNote, useDemoState, useMotionPreference } from "./motion";
import { createTrace, formatPixels, formatVelocity } from "./readout";

const SPRING = { duration: 0.7, bounce: 0.25 } as const;
const MARKER_PX = 28;
const TRACE = { width: 240, height: 56 } as const;
const TRACE_WINDOW_MS = 3000;
const KEY_STEP = 25;

const clamp = (value: number): number => Math.min(100, Math.max(0, value));

/**
 * A marker on a track. Click, drag or use the arrow keys to retarget it while it is moving: the spring keeps the
 * velocity it had, which the readout and the trace show. The spring value lives in percent of the track and every
 * per-frame number is written to the DOM through refs, so React renders only when the target changes.
 *
 * Reduced motion: the marker jumps to the new target and the velocity stays at zero.
 */
export function RetargetSpring() {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const ghost = useRef<HTMLSpanElement>(null);
  const position = useRef<HTMLSpanElement>(null);
  const velocity = useRef<HTMLSpanElement>(null);
  const carried = useRef<HTMLParagraphElement>(null);
  const line = useRef<SVGPathElement>(null);
  const ticks = useRef<SVGPathElement>(null);
  const zero = useRef<SVGLineElement>(null);

  const value = useSpringValue(0);
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const trace = useRef(createTrace(TRACE_WINDOW_MS));
  // Pixels the marker can travel; kept by a ResizeObserver so no frame ever reads layout.
  const range = useRef(0);
  const target = useRef(0);
  // Velocity at the last retarget, compared with the first frame after it.
  const pending = useRef<number | undefined>(undefined);
  const labelId = useId();
  const hintId = useId();

  const paint = (percent: number, speedPercent: number, record: boolean): void => {
    const px = (percent / 100) * range.current;
    const speed = (speedPercent / 100) * range.current;
    if (marker.current) marker.current.style.transform = `translate3d(${px}px,0,0)`;
    if (position.current) position.current.textContent = formatPixels(px);
    if (velocity.current) velocity.current.textContent = formatVelocity(speed);
    if (!record) return;
    trace.current.push(performance.now(), speed);
    const { line: d, marks, zeroY } = trace.current.path(TRACE);
    line.current?.setAttribute("d", d);
    ticks.current?.setAttribute("d", marks);
    zero.current?.setAttribute("y1", String(zeroY));
    zero.current?.setAttribute("y2", String(zeroY));
  };

  useEffect(() => {
    const element = track.current;
    if (element === null) return;
    const measure = (): void => {
      range.current = Math.max(0, element.clientWidth - MARKER_PX);
      paint(value.get(), value.getVelocity(), false);
      if (ghost.current) ghost.current.style.transform = `translate3d(${(target.current / 100) * range.current}px,0,0)`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const unsubscribe = value.onChange((percent, speed) => {
      paint(percent, speed, true);
      const before = pending.current;
      if (before !== undefined && carried.current) {
        pending.current = undefined;
        const after = (speed / 100) * range.current;
        carried.current.textContent = `Velocity at the retarget: ${formatVelocity(before)}. One frame later: ${formatVelocity(after)}. The new spring pulls on it, but it never restarts from rest.`;
      }
    });
    return () => {
      observer.disconnect();
      unsubscribe();
    };
    // `paint` only reads refs, and `value` is stable for the life of the component.
  }, [value]);

  const retarget = (percent: number, mark: boolean): void => {
    const next = clamp(percent);
    if (next === target.current && !value.animating) return;
    target.current = next;
    if (ghost.current) ghost.current.style.transform = `translate3d(${(next / 100) * range.current}px,0,0)`;
    track.current?.setAttribute("aria-valuenow", String(Math.round(next)));
    track.current?.setAttribute("aria-valuetext", `${Math.round(next)}% along the track`);
    if (motion.still) {
      value.jump(next);
      if (carried.current) carried.current.textContent = "Reduced motion: the marker jumped, so there is no velocity to carry.";
      void tracker.track(Promise.resolve(true));
      return;
    }
    const before = (value.getVelocity() / 100) * range.current;
    if (mark) trace.current.mark(performance.now());
    if (Math.abs(before) > 1) pending.current = before;
    else if (carried.current) carried.current.textContent = "Started from rest. Click again while it moves.";
    void tracker.track(value.set(next, SPRING));
  };

  const fromPointer = (event: PointerEvent<HTMLDivElement>): number => {
    const box = event.currentTarget.getBoundingClientRect();
    const usable = Math.max(1, box.width - MARKER_PX);
    return ((event.clientX - box.left - MARKER_PX / 2) / usable) * 100;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const keys: Record<string, number> = {
      ArrowRight: target.current + KEY_STEP,
      ArrowUp: target.current + KEY_STEP,
      ArrowLeft: target.current - KEY_STEP,
      ArrowDown: target.current - KEY_STEP,
      Home: 0,
      End: 100,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    retarget(next, true);
  };

  return (
    <div ref={root} className="not-content demo" data-demo="retarget-spring" data-state="idle" data-runs="0" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="demo-title">
        Retarget a spring mid-flight
      </p>
      <div
        ref={track}
        className="retarget-track"
        role="slider"
        tabIndex={0}
        aria-label="Target position"
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        aria-valuetext="0% along the track"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus({ preventScroll: true });
          retarget(fromPointer(event), true);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 0) retarget(fromPointer(event), false);
        }}
      >
        <span ref={ghost} className="retarget-target" aria-hidden="true" />
        <span ref={marker} className="retarget-marker" aria-hidden="true" />
      </div>
      <p id={hintId} className="demo-hint">
        Click or drag along the track, or focus it and use the arrow keys, Home and End. Retarget while the marker is still moving.
      </p>
      <dl className="demo-readouts">
        <div>
          <dt>Position</dt>
          <dd ref={position}>0.0 px</dd>
        </div>
        <div>
          <dt>Velocity</dt>
          <dd ref={velocity}>0 px/s</dd>
        </div>
      </dl>
      <svg className="retarget-trace" viewBox={`0 0 ${TRACE.width} ${TRACE.height}`} preserveAspectRatio="none" role="img" aria-label="Velocity over the last three seconds. Vertical ticks mark retargets.">
        <line ref={zero} x1="0" x2={TRACE.width} y1={TRACE.height / 2} y2={TRACE.height / 2} className="trace-zero" />
        <path ref={ticks} className="trace-marks" />
        <path ref={line} className="trace-line" />
      </svg>
      <p ref={carried} className="demo-status">
        Click the track to send the marker somewhere.
      </p>
      <MotionNote preference={motion} canPlay>
        The marker jumps to each target and the velocity stays at zero.
      </MotionNote>
    </div>
  );
}
