import { springParams } from "@damped/core";
import { useSpringValue } from "@damped/react";
import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useDemoState, useMotionPreference } from "../demos/motion";
import { formatVelocity } from "../demos/readout";
import {
  createPhaseTrail,
  createPositionTrail,
  createVelocityTracker,
  dampingRatio,
  formatDamping,
  formatDisplacement,
  limitVelocity,
  percentAt,
  phasePoint,
  SPRING,
} from "./instrument-math";

const PARAMS = springParams(SPRING);
const OMEGA = Math.sqrt(PARAMS.stiffness / PARAMS.mass);
const ZETA = formatDamping(dampingRatio(PARAMS));

const START = 50;
const KEY_STEP = 10;
const TRAIL = { windowMs: 1600, gapMs: 120, height: 100 } as const;
const PHASE = { size: 100, extent: 105 } as const;
const PHASE_POINTS = 900;
// A pointer that rests this long before the release hands no velocity to the mass.
const STALE_MS = 80;
const TICKS = Array.from({ length: 21 }, (_, index) => index);
const LABELS = new Set([0, 10, 20]);

const clamp = (value: number): number => Math.min(100, Math.max(0, value));

/**
 * The landing hero: a mass on a hairline track, driven by the same `useSpringValue` the docs describe. Drag the mass
 * and let go and it springs home with the velocity of your hand; press the track while it moves and the rest point
 * moves with it, velocity kept. A strip under the track records recent positions, and the phase portrait beside it
 * draws position against velocity as the mass settles: the spiral that ends on the rest dot.
 *
 * Every per-frame number goes to the DOM through refs, so React renders once. Reduced motion: the mass jumps to each
 * rest point, and "Play anyway" brings the spring back.
 */
export function SpringInstrument() {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const mass = useRef<HTMLSpanElement>(null);
  const rest = useRef<HTMLSpanElement>(null);
  const positionOut = useRef<HTMLElement>(null);
  const velocityOut = useRef<HTMLElement>(null);
  const trailPath = useRef<SVGPathElement>(null);
  const phasePath = useRef<SVGPathElement>(null);
  const phaseHead = useRef<SVGCircleElement>(null);
  const status = useRef<HTMLParagraphElement>(null);

  const value = useSpringValue(START);
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const trail = useRef(createPositionTrail(TRAIL.windowMs, TRAIL.gapMs));
  const phase = useRef(createPhaseTrail(PHASE_POINTS));
  const samples = useRef(createVelocityTracker());
  // Pixels the mass can travel; kept by a ResizeObserver so no frame ever reads layout.
  const range = useRef(0);
  const target = useRef(START);
  const dragging = useRef(false);
  const pressing = useRef(false);
  // Where the pointer grabbed the mass, so it does not jump to the pointer.
  const grab = useRef(0);
  const dragSpeed = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const labelId = useId();
  const hintId = useId();
  const fadeId = useId();

  const place = (element: HTMLElement | null, percent: number): void => {
    if (element) element.style.transform = `translate3d(${((percent - START) / 100) * range.current}px,0,0)`;
  };

  const paint = (percent: number, speed: number, drawPhase: boolean): void => {
    place(mass.current, percent);
    if (positionOut.current) positionOut.current.textContent = formatDisplacement(((percent - target.current) / 100) * range.current);
    if (velocityOut.current) velocityOut.current.textContent = formatVelocity((speed / 100) * range.current);
    trail.current.push(performance.now(), percent);
    trailPath.current?.setAttribute("d", trail.current.path(TRAIL.height));
    if (!drawPhase) return;
    const { d, w } = phasePoint(percent, target.current, speed, OMEGA);
    phase.current.push(d, w);
    phasePath.current?.setAttribute("d", phase.current.path(PHASE));
    const head = phase.current.head(PHASE);
    if (head) {
      phaseHead.current?.setAttribute("cx", String(head.x));
      phaseHead.current?.setAttribute("cy", String(head.y));
    }
  };

  const clearPhase = (): void => {
    phase.current.clear();
    phasePath.current?.setAttribute("d", "");
    phaseHead.current?.setAttribute("cx", String(PHASE.size / 2));
    phaseHead.current?.setAttribute("cy", String(PHASE.size / 2));
  };

  useEffect(() => {
    const element = rail.current;
    if (element === null) return;
    const measure = (): void => {
      range.current = element.clientWidth;
      paint(value.get(), value.getVelocity(), false);
      place(rest.current, target.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const unsubscribe = value.onChange((percent, speed) => {
      if (dragging.current) paint(percent, dragSpeed.current, false);
      else paint(percent, speed, true);
    });
    return () => {
      observer.disconnect();
      unsubscribe();
      clearTimeout(idleTimer.current);
    };
    // `paint` and `place` only read refs, and `value` is stable for the life of the component.
  }, [value]);

  const announce = (text: string): void => {
    if (status.current) status.current.textContent = text;
  };

  const aim = (percent: number): void => {
    target.current = percent;
    place(rest.current, percent);
    track.current?.setAttribute("aria-valuenow", String(Math.round(percent)));
    track.current?.setAttribute("aria-valuetext", `Rest point at ${Math.round(percent)} percent of the track`);
  };

  /** Sends the mass to `next`, keeping whatever velocity it has, or `velocity` when it is given (a release). */
  const retarget = (next: number, velocity?: number): void => {
    if (velocity === undefined && next === target.current && !value.animating && value.get() === next) return;
    aim(next);
    if (motion.still) {
      value.jump(next);
      clearPhase();
      announce(`Rest point at ${Math.round(next)} percent. Reduced motion is on, so the mass jumped there.`);
      void tracker.track(Promise.resolve(true));
      return;
    }
    // A run from rest starts a fresh portrait; a retarget mid-flight keeps drawing the same curve.
    if (!value.animating) clearPhase();
    const run = value.set(next, SPRING);
    if (velocity !== undefined && velocity !== 0) value.rebase(value.get(), velocity);
    void tracker.track(run).then((completed) => {
      if (completed) announce(`Settled at ${Math.round(target.current)} percent of the track.`);
    });
  };

  const pointerPercent = (event: PointerEvent<HTMLDivElement>): number => {
    const box = rail.current?.getBoundingClientRect();
    return percentAt(event.clientX, box?.left ?? 0, box?.width ?? 0);
  };

  const release = (event: PointerEvent<HTMLDivElement>, carry: boolean): void => {
    if (!dragging.current) {
      pressing.current = false;
      return;
    }
    dragging.current = false;
    clearTimeout(idleTimer.current);
    const here = value.get();
    const velocity = carry ? limitVelocity(here, target.current, samples.current.velocity(event.timeStamp)) : 0;
    retarget(target.current, velocity);
    // The grab counted as a run so the state stayed "animating" through the drag; end it after the spring began.
    tracker.settle();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; the press still works without it.
    }
    event.currentTarget.focus({ preventScroll: true });
    const percent = pointerPercent(event);
    if (mass.current?.contains(event.target as Node)) {
      dragging.current = true;
      tracker.begin();
      grab.current = value.get() - percent;
      samples.current.reset();
      samples.current.push(event.timeStamp, value.get());
      dragSpeed.current = 0;
      clearPhase();
      value.jump(value.get());
      announce("");
      return;
    }
    pressing.current = true;
    retarget(percent);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragging.current) {
      const percent = clamp(pointerPercent(event) + grab.current);
      samples.current.push(event.timeStamp, percent);
      dragSpeed.current = samples.current.velocity(event.timeStamp);
      value.jump(percent);
      // The readout must not keep a speed the hand no longer has.
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        dragSpeed.current = 0;
        if (velocityOut.current) velocityOut.current.textContent = formatVelocity(0);
      }, STALE_MS);
      return;
    }
    if (pressing.current && event.buttons !== 0) retarget(pointerPercent(event));
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
    retarget(clamp(next));
  };

  return (
    <div ref={root} className="not-content instrument" data-demo="spring-instrument" data-state="idle" data-runs="0" role="group" aria-labelledby={labelId}>
      <div className="instrument__bar">
        <p id={labelId} className="instrument__label">
          Spring instrument
        </p>
        <p className="instrument__spec" aria-hidden="true">
          bounce {SPRING.bounce} · duration {SPRING.duration} s
        </p>
      </div>

      <div className="instrument__body">
        <div
          ref={track}
          className="instrument__track"
          role="slider"
          tabIndex={0}
          aria-label="Spring rest point"
          aria-describedby={hintId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={START}
          aria-valuetext={`Rest point at ${START} percent of the track`}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => release(event, true)}
          onPointerCancel={(event) => release(event, false)}
        >
          <div ref={rail} className="instrument__rail">
            <div className="instrument__ticks" aria-hidden="true">
              {TICKS.map((index) => (
                <i key={index} className={index % 5 === 0 ? "instrument__tick instrument__tick--major" : "instrument__tick"} style={{ left: `${index * 5}%` }}>
                  {LABELS.has(index) && <b>{index * 5}</b>}
                </i>
              ))}
            </div>
            <svg className="instrument__trail" viewBox={`0 0 100 ${TRAIL.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
              {/* The strip fades with age, so it reads as a recording that is draining away. */}
              <defs>
                <linearGradient id={fadeId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={TRAIL.height}>
                  <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
                  <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="instrument__trail-path" ref={trailPath} d="" stroke={`url(#${fadeId})`} vectorEffect="non-scaling-stroke" />
            </svg>
            <span ref={rest} className="instrument__rest" aria-hidden="true" />
            <span ref={mass} className="instrument__mass" aria-hidden="true" />
          </div>
        </div>

        <figure className="instrument__phase">
          <svg viewBox={`0 0 ${PHASE.size} ${PHASE.size}`} role="img" aria-label="Phase portrait of the mass: position against velocity, spiralling into the rest dot as it settles." focusable="false">
            <line className="instrument__axis" x1="0" x2={PHASE.size} y1={PHASE.size / 2} y2={PHASE.size / 2} />
            <line className="instrument__axis" x1={PHASE.size / 2} x2={PHASE.size / 2} y1="0" y2={PHASE.size} />
            <path className="instrument__phase-path" ref={phasePath} d="" vectorEffect="non-scaling-stroke" />
            <circle className="instrument__rest-dot" cx={PHASE.size / 2} cy={PHASE.size / 2} r="2.6" />
            <circle className="instrument__phase-head" ref={phaseHead} cx={PHASE.size / 2} cy={PHASE.size / 2} r="1.9" />
          </svg>
          <figcaption>Position against velocity. Every interruption keeps its place on this curve.</figcaption>
        </figure>
      </div>

      <div className="instrument__foot">
        <dl className="instrument__readouts" aria-hidden="true">
          <div>
            <dt>x</dt>
            <dd ref={positionOut} data-readout="x">
              +0.0 px
            </dd>
          </div>
          <div>
            <dt>v</dt>
            <dd ref={velocityOut} data-readout="v">
              0 px/s
            </dd>
          </div>
          <div>
            <dt>ζ</dt>
            <dd data-readout="zeta">{ZETA}</dd>
          </div>
        </dl>
        <p id={hintId} className="instrument__hint">
          Drag the mass and let go, or press the track while it moves. Arrow keys, Home and End also move the rest point.
        </p>
      </div>

      <p ref={status} role="status" className="instrument__sr" />
      {motion.reduced && (
        <p className="instrument__note" role="note">
          <span>Reduced motion is on. The mass jumps to each rest point instead of springing.</span>
          <button type="button" className="instrument__button" aria-pressed={motion.playAnyway} onClick={() => motion.setPlayAnyway(!motion.playAnyway)}>
            {motion.playAnyway ? "Stop playing anyway" : "Play anyway"}
          </button>
        </p>
      )}
    </div>
  );
}
