import { useSpringValue } from "@damped/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MotionNote, useDemoState, useMotionPreference } from "../demos/motion";
import { coilPath } from "./coil";
import { Figure, Readout } from "./figure";
import { capture, signed } from "./format";
import { launch } from "./launch";
import { createVelocityTracker } from "./pointer";
import { createSeries } from "./series";

// Everything is laid out in SVG units; the figure scales with its container, so one unit is not one pixel.
const VIEW = { width: 560, height: 150 } as const;
const WALL = 24;
const REST = 320;
const SIZE = 56;
const MID = 75;
const LIMIT = 140;
const KEY_STEP = 12;
const MAX_SPEED = 2500;
const PLOT = { width: 560, height: 104 } as const;
const PLOT_RANGE = { min: -LIMIT * 1.1, max: LIMIT * 1.1 } as const;
const WINDOW_MS = 5000;
// Damping ratio 0.35: it swings a few times before it rests, which is what the figure is for.
const SPRING = { duration: 0.8, bounce: 0.65, restDelta: 0.2, restSpeed: 2 } as const;

const clamp = (value: number): number => Math.min(LIMIT, Math.max(-LIMIT, value));
const side = (x: number): string => `${Math.abs(Math.round(x))} units to the ${x > 0 ? "right" : "left"} of rest`;

const IDLE_TEXT = "The mass is at rest. Drag it and let go, or focus it, pull it with the arrow keys and let go with Enter or Space.";

/**
 * A mass on a spring. Pull it with the pointer or the arrow keys and let go: the release hands the velocity of your
 * hand to a damped spring that pulls the mass back to rest. Grab it while it swings and it stops where it is.
 *
 * Every per-frame number (the transform, the coil, the readouts, the plot) is written through refs, so React renders
 * once. The slider value and the live text change only on grab, key press and release, never per frame.
 *
 * Reduced motion: a release puts the mass back at rest at once. "Play anyway" restores the motion.
 */
export function MassOnSpring() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<SVGSVGElement>(null);
  const handle = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const coil = useRef<SVGPathElement>(null);
  const position = useRef<HTMLElement>(null);
  const velocity = useRef<HTMLElement>(null);
  const line = useRef<SVGPathElement>(null);
  const ticks = useRef<SVGPathElement>(null);
  const live = useRef<HTMLParagraphElement>(null);

  const value = useSpringValue(0);
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const [series] = useState(() => createSeries(WINDOW_MS));
  const [hand] = useState(() => createVelocityTracker());
  // What holds the mass right now: the pointer, the keyboard, or nothing.
  const held = useRef<"pointer" | "key" | null>(null);
  const grabOffset = useRef(0);
  const run = useRef(0);

  const say = (text: string): void => {
    if (live.current) live.current.textContent = text;
  };

  const paint = (x: number, speed: number): void => {
    body.current?.setAttribute("transform", `translate(${x} 0)`);
    coil.current?.setAttribute("d", coilPath(WALL, REST + x, MID));
    if (position.current) position.current.textContent = signed(x, 1);
    if (velocity.current) velocity.current.textContent = signed(speed, 0);
    series.push(performance.now(), x);
    const drawn = series.path(PLOT, PLOT_RANGE);
    line.current?.setAttribute("d", drawn.line);
    ticks.current?.setAttribute("d", drawn.marks);
  };

  useEffect(() => value.onChange(paint), [value]);

  const describe = (x: number): void => {
    handle.current?.setAttribute("aria-valuenow", String(Math.round(x)));
    handle.current?.setAttribute("aria-valuetext", Math.abs(x) < 0.5 ? "At rest" : side(x));
  };

  const pointerX = (event: PointerEvent<Element>): number => {
    const box = stage.current?.getBoundingClientRect();
    return box && box.width > 0 ? (event.clientX - box.left) * (VIEW.width / box.width) : event.clientX;
  };

  const grab = (by: "pointer" | "key"): void => {
    held.current = by;
    run.current++;
    value.stop();
    hand.reset();
    series.mark(performance.now());
  };

  const hold = (x: number): void => {
    value.jump(x);
    describe(x);
  };

  const release = (speed: number): void => {
    held.current = null;
    const x = value.get();
    describe(x);
    const mine = ++run.current;
    series.mark(performance.now());
    if (motion.still) {
      value.jump(0);
      describe(0);
      say("Reduced motion is on, so the mass went straight back to rest.");
      void tracker.track(Promise.resolve(true));
      return;
    }
    say(`Released ${side(x)}${Math.abs(speed) > 1 ? `, moving ${signed(speed, 0)} units per second` : ""}.`);
    void tracker.track(launch(value, { position: x, velocity: speed }, 0, SPRING)).then((completed) => {
      if (completed && mine === run.current) {
        describe(0);
        say("The mass came to rest.");
      }
    });
  };

  const onKeyDown = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (held.current === null) grab("key");
      const x = clamp(value.get() + (event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP));
      hold(x);
      say(`Holding the mass ${side(x)}. Press Enter or Space to let go.`);
    } else if ((event.key === "Enter" || event.key === " ") && held.current !== null) {
      event.preventDefault();
      release(0);
    }
  };

  return (
    <Figure ref={root} demo="physics-mass" title="A mass on a spring">
      <svg ref={stage} className="physics-stage" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="presentation">
        <g className="physics-wall" aria-hidden="true">
          <line x1={WALL} x2={WALL} y1={MID - 44} y2={MID + 44} />
          {[-36, -18, 0, 18, 36].map((offset) => (
            <line key={offset} x1={WALL} x2={WALL - 9} y1={MID + offset} y2={MID + offset + 9} />
          ))}
          <line className="physics-floor" x1={WALL} x2={VIEW.width - 16} y1={MID + SIZE / 2 + 10} y2={MID + SIZE / 2 + 10} />
          <line className="physics-rest-line" x1={REST + SIZE / 2} x2={REST + SIZE / 2} y1={MID - 46} y2={MID + SIZE / 2 + 18} />
          <text className="physics-label" x={REST + SIZE / 2} y={MID - 52} textAnchor="middle">
            rest
          </text>
        </g>
        <path ref={coil} className="physics-coil" d={coilPath(WALL, REST, MID)} aria-hidden="true" />
        <g
          ref={handle}
          className="physics-slider"
          role="slider"
          tabIndex={0}
          aria-label="Mass: displacement from rest"
          aria-orientation="horizontal"
          aria-valuemin={-LIMIT}
          aria-valuemax={LIMIT}
          aria-valuenow={0}
          aria-valuetext="At rest"
          onKeyDown={onKeyDown}
          onBlur={() => {
            // A mass held by the keyboard must not stay held when focus leaves.
            if (held.current === "key") release(0);
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            capture(event.currentTarget, event.pointerId);
            grab("pointer");
            grabOffset.current = pointerX(event) - (REST + SIZE / 2 + value.get());
            hand.push(performance.now(), value.get());
            say(`Holding the mass ${side(value.get())}.`);
          }}
          onPointerMove={(event) => {
            if (held.current !== "pointer") return;
            const x = clamp(pointerX(event) - grabOffset.current - (REST + SIZE / 2));
            hold(x);
            hand.push(performance.now(), x);
          }}
          onPointerUp={() => {
            if (held.current === "pointer") release(Math.max(-MAX_SPEED, Math.min(MAX_SPEED, hand.velocity(performance.now()))));
          }}
          onPointerCancel={() => {
            if (held.current === "pointer") release(0);
          }}
        >
          <g ref={body} transform="translate(0 0)">
            <rect className="physics-hit" x={REST - 10} y={MID - SIZE / 2 - 10} width={SIZE + 20} height={SIZE + 20} />
            <rect className="physics-focus-ring" x={REST - 5} y={MID - SIZE / 2 - 5} width={SIZE + 10} height={SIZE + 10} rx={5} />
            <rect className="physics-mass" x={REST} y={MID - SIZE / 2} width={SIZE} height={SIZE} rx={4} />
            <path className="physics-grip" d={[-8, 0, 8].map((dx) => `M${REST + SIZE / 2 + dx} ${MID - 9} V${MID + 9}`).join(" ")} />
          </g>
        </g>
      </svg>
      <svg className="physics-plot" viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} preserveAspectRatio="none" role="img" aria-label="Position of the mass over the last five seconds. Vertical ticks mark each grab and release.">
        <line className="physics-axis" x1={0} x2={PLOT.width} y1={PLOT.height / 2} y2={PLOT.height / 2} />
        <path ref={ticks} className="physics-ticks" />
        <path ref={line} className="physics-trace" />
      </svg>
      <p className="physics-caption">Position over the last five seconds. Rest is the line through the middle.</p>
      <dl className="physics-readouts">
        <Readout ref={position} name="position" label="Position (units)">
          0.0
        </Readout>
        <Readout ref={velocity} name="velocity" label="Velocity (units/s)">
          0
        </Readout>
      </dl>
      <p ref={live} className="physics-live" aria-live="polite">
        {IDLE_TEXT}
      </p>
      <MotionNote preference={motion} canPlay>
        A release puts the mass back at rest at once. Dragging still works.
      </MotionNote>
    </Figure>
  );
}
