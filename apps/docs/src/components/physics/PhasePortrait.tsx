import { useSpringValue } from "@damped/react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { buildMark, MASTER } from "../../../../../brand/mark";
import { MotionNote, useDemoState, useMotionPreference } from "../demos/motion";
import { bounceFromZeta, classifyDamping } from "./damping";
import { Figure, Readout } from "./figure";
import { capture, plain, signed } from "./format";
import { launch } from "./launch";
import { createTrail, phasePath, phaseScale, samplePhase, type PhasePoint } from "./phase";

const PLANE = { width: 320, height: 320, padding: 24 } as const;
const DOMAIN = 1.2;
const DURATION = 1;
const OMEGA = (2 * Math.PI) / DURATION;
const EDGE = 0.9;
const KEY_STEP = 0.1;
const LANE = { width: 320, height: 36 } as const;
const GHOST_SAMPLES = 160;

const scale = phaseScale(PLANE, DOMAIN);
const mark = buildMark(MASTER);

const optionsFor = (zeta: number) => ({ duration: DURATION, bounce: bounceFromZeta(zeta), restDelta: 0.004, restSpeed: 0.03 });
const clamp = (value: number): number => Math.min(DOMAIN, Math.max(-DOMAIN, value));

interface Held {
  x: number;
  /** Velocity divided by the natural frequency, so both axes share a unit. */
  y: number;
  by: "pointer" | "key" | "button";
}

/**
 * The state of a spring is a point on a plane: position across, velocity up. Drag the point anywhere (or move it with
 * the arrow keys) and let go: the spring continues from exactly that state and draws its path, a spiral that winds
 * into the rest point. That path is the damped mark. Changing the damping ratio mid-flight keeps the state.
 *
 * Every per-frame number is written through refs. The trail is a `createTrail` path set on the DOM, the dot, the
 * ball in the lane and the readouts too; React renders when the damping ratio changes.
 *
 * Reduced motion: a release puts the mass at rest at once and draws the whole path.
 */
export function PhasePortrait() {
  const root = useRef<HTMLDivElement>(null);
  const plane = useRef<SVGSVGElement>(null);
  const handle = useRef<SVGGElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const trailPath = useRef<SVGPathElement>(null);
  const ghost = useRef<SVGPathElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const position = useRef<HTMLElement>(null);
  const velocity = useRef<HTMLElement>(null);
  const live = useRef<HTMLParagraphElement>(null);

  const [zeta, setZeta] = useState(0.25);
  const inputId = useId();
  const value = useSpringValue(0);
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const [trail] = useState(() => createTrail(3000));
  const held = useRef<Held | null>(null);
  // While a launch rewrites the value's state the listener must not draw the in-between states.
  const launching = useRef(false);
  const run = useRef(0);
  const options = useMemo(() => optionsFor(zeta), [zeta]);

  const say = (text: string): void => {
    if (live.current) live.current.textContent = text;
  };

  const paint = (x: number, y: number): void => {
    dot.current?.setAttribute("cx", String(scale.x(x)));
    dot.current?.setAttribute("cy", String(scale.y(y)));
    ball.current?.setAttribute("cx", String(scale.x(x)));
    if (position.current) position.current.textContent = signed(x, 2);
    if (velocity.current) velocity.current.textContent = signed(y * OMEGA, 2);
  };

  const drawTrail = (): void => trailPath.current?.setAttribute("d", trail.path(scale));

  useEffect(
    () =>
      value.onChange((x, speed) => {
        const y = speed / OMEGA;
        paint(x, y);
        if (launching.current) return;
        trail.push({ x, y });
        drawTrail();
      }),
    [value],
  );

  const describe = (x: number, y: number): void => {
    handle.current?.setAttribute("aria-valuenow", String(Math.round(x * 100)));
    handle.current?.setAttribute("aria-valuetext", `Position ${signed(x, 2)}, velocity ${signed(y * OMEGA, 2)}`);
  };

  const preview = (state: Held, next = options): void => {
    const points = samplePhase(next, { position: state.x, velocity: state.y * OMEGA }, { samples: GHOST_SAMPLES });
    ghost.current?.setAttribute("d", phasePath(points, scale));
  };

  const hold = (x: number, y: number, by: Held["by"]): void => {
    if (held.current === null) {
      // Taking hold of it stops whatever is moving and starts a fresh path.
      run.current++;
      value.stop();
      trail.clear();
      drawTrail();
    }
    held.current = { x, y, by };
    paint(x, y);
    describe(x, y);
    preview(held.current);
  };

  const begin = (x: number, y: number, next: typeof options): void => {
    launching.current = true;
    const finished = launch(value, { position: x, velocity: y * OMEGA }, 0, next);
    launching.current = false;
    const mine = run.current;
    void tracker.track(finished).then((completed) => {
      if (completed && mine === run.current) {
        describe(0, 0);
        say("The state reached the rest point.");
      }
    });
  };

  const letGo = (): void => {
    const state = held.current;
    if (state === null) return;
    held.current = null;
    ghost.current?.setAttribute("d", "");
    const mine = ++run.current;
    if (motion.still) {
      trail.clear();
      for (const point of samplePhase(options, { position: state.x, velocity: state.y * OMEGA }, { samples: 240 })) trail.push(point);
      drawTrail();
      value.jump(0);
      describe(0, 0);
      say("Reduced motion is on, so the whole path is drawn at once and the mass is at rest.");
      void tracker.track(Promise.resolve(true));
      return;
    }
    trail.push({ x: state.x, y: state.y });
    drawTrail();
    say(`Released at position ${signed(state.x, 2)} with velocity ${signed(state.y * OMEGA, 2)}.`);
    run.current = mine;
    begin(state.x, state.y, options);
  };

  const fromPointer = (event: PointerEvent<Element>): PhasePoint => {
    const box = plane.current?.getBoundingClientRect();
    const k = box && box.width > 0 ? PLANE.width / box.width : 1;
    const left = box?.left ?? 0;
    const top = box?.top ?? 0;
    return scale.invert((event.clientX - left) * k, (event.clientY - top) * k);
  };

  const onKeyDown = (event: KeyboardEvent<SVGGElement>): void => {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [KEY_STEP, 0],
      ArrowLeft: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      // Taking hold in flight keeps the state, velocity included: letting go continues from where it was.
      const from = held.current ?? { x: value.get(), y: value.getVelocity() / OMEGA, by: "key" as const };
      hold(clamp(from.x + move[0]), clamp(from.y + move[1]), "key");
      say(`Holding the state at position ${signed(held.current!.x, 2)}, velocity ${signed(held.current!.y * OMEGA, 2)}. Press Enter or Space to let go.`);
    } else if ((event.key === "Enter" || event.key === " ") && held.current !== null) {
      event.preventDefault();
      letGo();
    }
  };

  const changeZeta = (next: number): void => {
    setZeta(next);
    const nextOptions = optionsFor(next);
    if (held.current !== null) {
      preview(held.current, nextOptions);
    } else if (value.animating) {
      // The spring changes under the moving point; position and velocity carry over.
      run.current++;
      begin(value.get(), value.getVelocity() / OMEGA, nextOptions);
    }
  };

  const start = (x: number, y: number): void => {
    hold(x, y, "button");
    letGo();
  };

  const kind = classifyDamping(zeta);

  return (
    <Figure ref={root} demo="physics-phase" title="The phase portrait">
      <div className="physics-phase-layout">
        <div className="physics-phase-main">
          <svg
            ref={plane}
            className="physics-plane"
            viewBox={`0 0 ${PLANE.width} ${PLANE.height}`}
            role="presentation"
            onPointerDown={(event) => {
              event.preventDefault();
              capture(event.currentTarget, event.pointerId);
              const point = fromPointer(event);
              hold(point.x, point.y, "pointer");
              say(`Holding the state at position ${signed(point.x, 2)}, velocity ${signed(point.y * OMEGA, 2)}.`);
            }}
            onPointerMove={(event) => {
              if (held.current?.by !== "pointer") return;
              const point = fromPointer(event);
              hold(point.x, point.y, "pointer");
            }}
            onPointerUp={() => {
              if (held.current?.by === "pointer") letGo();
            }}
            onPointerCancel={() => {
              if (held.current?.by === "pointer") letGo();
            }}
          >
            <g className="physics-grid" aria-hidden="true">
              <line x1={PLANE.padding} x2={PLANE.width - PLANE.padding} y1={scale.y(0)} y2={scale.y(0)} />
              <line x1={scale.x(0)} x2={scale.x(0)} y1={PLANE.padding} y2={PLANE.height - PLANE.padding} />
              <text className="physics-label" x={PLANE.width - PLANE.padding} y={scale.y(0) + 14} textAnchor="end">
                position
              </text>
              <text className="physics-label" x={scale.x(0) + 6} y={PLANE.padding + 8}>
                velocity
              </text>
            </g>
            <path ref={ghost} className="physics-ghost" d="" aria-hidden="true" />
            <path ref={trailPath} className="physics-trail" d="" aria-hidden="true" />
            <circle className="physics-rest" cx={scale.x(0)} cy={scale.y(0)} r={3} aria-hidden="true" />
            <g
              ref={handle}
              className="physics-slider"
              role="slider"
              tabIndex={0}
              aria-label="State: position and velocity"
              aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Enter"
              aria-valuemin={-120}
              aria-valuemax={120}
              aria-valuenow={0}
              aria-valuetext="Position 0.00, velocity 0.00"
              onKeyDown={onKeyDown}
              onBlur={() => {
                if (held.current?.by === "key") letGo();
              }}
            >
              <circle className="physics-focus-ring" cx={scale.x(0)} cy={scale.y(0)} r={13} />
              <circle ref={dot} className="physics-point" cx={scale.x(0)} cy={scale.y(0)} r={6} />
            </g>
          </svg>
          <svg className="physics-lane" viewBox={`0 0 ${LANE.width} ${LANE.height}`} aria-hidden="true">
            <line className="physics-axis" x1={scale.x(-DOMAIN)} x2={scale.x(DOMAIN)} y1={LANE.height / 2} y2={LANE.height / 2} />
            <line className="physics-start-tick" x1={scale.x(0)} x2={scale.x(0)} y1={6} y2={LANE.height - 6} />
            <circle ref={ball} className="physics-ball" r={7} cx={scale.x(0)} cy={LANE.height / 2} />
          </svg>
        </div>
        <aside className="physics-phase-aside">
          <svg data-mark className="physics-mark" viewBox="0 0 32 32" role="img" aria-label="The damped mark">
            <path d={mark.d} fill="currentColor" />
            <circle className="physics-rest" cx={mark.dot.cx} cy={mark.dot.cy} r={mark.dot.r} />
          </svg>
          <p>
            The damped mark is this curve: one winding of the path, and the rest point it winds into.
          </p>
        </aside>
      </div>
      <div className="physics-controls">
        <div className="physics-field">
          <label htmlFor={inputId}>
            Damping ratio <output htmlFor={inputId}>ζ {plain(zeta, 2)}</output>
          </label>
          <input id={inputId} type="range" min={0.1} max={1.5} step={0.05} value={zeta} onChange={(event) => changeZeta(Number(event.target.value))} />
        </div>
        <div className="physics-actions">
          <button type="button" className="demo-button" onClick={() => start(EDGE, 0)}>
            Pull and release
          </button>
          <button type="button" className="demo-button" onClick={() => start(0, EDGE)}>
            Kick
          </button>
        </div>
      </div>
      <p className="physics-hint">Drag the dot anywhere on the plane, or focus it and use the arrow keys, then let go (Enter or Space). Pull and release starts from the edge, Kick from the middle with a push.</p>
      <dl className="physics-readouts physics-readouts--wrap">
        <Readout ref={position} name="position" label="Position">
          0.00
        </Readout>
        <Readout ref={velocity} name="velocity" label="Velocity (per s)">
          0.00
        </Readout>
        <Readout name="zeta" label="Damping ratio">
          {plain(zeta, 2)}
        </Readout>
        <Readout name="kind" label="Path">
          {kind === "underdamped" ? "spiral" : "no spiral"}
        </Readout>
      </dl>
      <p ref={live} className="physics-live" aria-live="polite">
        The state is a point: position across, velocity up. Drag it, then let go.
      </p>
      <MotionNote preference={motion} canPlay>
        Letting go puts the mass at rest at once and draws the whole path.
      </MotionNote>
    </Figure>
  );
}
