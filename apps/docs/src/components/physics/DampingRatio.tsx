import { useSpringValue } from "@damped/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MotionNote, useDemoState, useMotionPreference } from "../demos/motion";
import { curvePath, describeSpring, plotScale, type PlotBox } from "../demos/spring-curve";
import { bounceFromZeta, classifyDamping, peakOvershoot, sampleResponse } from "./damping";
import { Figure, Readout } from "./figure";
import { plain } from "./format";

const DURATION = 0.6;
const PLOT: PlotBox = { width: 560, height: 230, padding: 30 };
const AXIS = { tMax: 2, samples: 160, yMin: -0.05, yMax: 1.7 } as const;
const LANE = { width: 560, height: 40, padding: 28 } as const;
const BALL_R = 8;
const TIME_TICKS = [0.5, 1, 1.5, 2] as const;

const REFERENCES = [
  { zeta: 0.3, name: "underdamped" },
  { zeta: 1, name: "critically damped" },
  { zeta: 2, name: "overdamped" },
] as const;

const optionsFor = (zeta: number) => ({ duration: DURATION, bounce: bounceFromZeta(zeta) });
const referencePaths = REFERENCES.map(({ zeta }) => curvePath(sampleResponse(optionsFor(zeta), AXIS), PLOT));
const laneX = (value: number): number => LANE.padding + ((value - AXIS.yMin) / (AXIS.yMax - AXIS.yMin)) * (LANE.width - 2 * LANE.padding);

/**
 * One native range sets the damping ratio. The curves are the closed form of `createSpring` (nothing animates to draw
 * them): three reference curves stay on the plot, the current ratio is the highlighted one. Replay runs a real
 * spring value with the same options, so the ball in the lane and the dot on the curve follow the curve exactly.
 *
 * Reduced motion: Replay puts the ball at the target at once; the curve and the numbers still update.
 */
export function DampingRatio() {
  const root = useRef<HTMLDivElement>(null);
  const ball = useRef<SVGCircleElement>(null);
  const head = useRef<SVGCircleElement>(null);
  const [zeta, setZeta] = useState(0.4);
  const inputId = useId();

  const motion = useMotionPreference();
  const tracker = useDemoState(root);
  const progress = useSpringValue(0);

  const spring = useMemo(() => optionsFor(zeta), [zeta]);
  const curve = useMemo(() => sampleResponse(spring, AXIS), [spring]);
  const scale = useMemo(() => plotScale(curve, PLOT), [curve]);
  const info = useMemo(() => describeSpring(spring), [spring]);
  const overshoot = peakOvershoot(zeta);
  const latest = useRef({ scale, curve });
  latest.current = { scale, curve };
  const started = useRef(0);

  useEffect(
    () =>
      progress.onChange((value) => {
        ball.current?.setAttribute("cx", String(laneX(value)));
        const dot = head.current;
        if (!dot) return;
        const elapsed = (performance.now() - started.current) / 1000;
        const { scale: current, curve: shown } = latest.current;
        dot.setAttribute("cx", String(current.x(Math.min(elapsed, shown.tMax))));
        dot.setAttribute("cy", String(current.y(value)));
      }),
    [progress],
  );

  const rewind = (): void => {
    progress.jump(0);
    head.current?.setAttribute("opacity", "0");
  };

  const replay = (): void => {
    rewind();
    if (motion.still) {
      progress.jump(1);
      void tracker.track(Promise.resolve(true));
      return;
    }
    started.current = performance.now();
    head.current?.setAttribute("opacity", "1");
    void tracker.track(progress.set(1, spring));
  };

  const kind = classifyDamping(zeta);
  const description = `Damping ratio ${plain(zeta, 2)}, ${kind}. ${
    overshoot > 0 ? `It overshoots the target by ${plain(overshoot * 100, 1)} percent` : "It never passes the target"
  } and settles after ${plain(info.settleTime, 2)} seconds.`;

  return (
    <Figure ref={root} demo="physics-damping" title="Damping ratio">
      <div className="physics-controls">
        <div className="physics-field">
          <label htmlFor={inputId}>
            Damping ratio ζ{" "}
            <output htmlFor={inputId}>
              ζ {plain(zeta, 2)} · bounce {plain(bounceFromZeta(zeta), 2)}
            </output>
          </label>
          <input
            id={inputId}
            type="range"
            min={0.15}
            max={2}
            step={0.05}
            value={zeta}
            aria-describedby={`${inputId}-help`}
            onChange={(event) => {
              rewind();
              setZeta(Number(event.target.value));
            }}
            onPointerUp={replay}
            onKeyUp={(event) => {
              if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") replay();
            }}
          />
        </div>
        <button type="button" className="demo-button" onClick={replay}>
          Replay
        </button>
      </div>
      <p id={`${inputId}-help`} className="physics-hint">
        Slide to change how much friction there is. Letting go replays the motion.
      </p>
      <svg className="physics-curves" viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} role="img" aria-label={`Position over time, from 0 to 1. ${description}`}>
        <line className="physics-axis" x1={PLOT.padding} x2={PLOT.width - PLOT.padding} y1={scale.y(0)} y2={scale.y(0)} />
        <line className="physics-target" x1={PLOT.padding} x2={PLOT.width - PLOT.padding} y1={scale.y(1)} y2={scale.y(1)} />
        <text className="physics-label" x={PLOT.padding} y={scale.y(1) - 6}>
          target
        </text>
        {TIME_TICKS.map((t) => (
          <text key={t} className="physics-label" x={scale.x(t)} y={PLOT.height - 8} textAnchor="middle">
            {`${t} s`}
          </text>
        ))}
        {referencePaths.map((d, index) => (
          <path key={REFERENCES[index]!.name} className="physics-reference" d={d} />
        ))}
        <path className="physics-current" d={curvePath(curve, PLOT)} />
        <circle ref={head} className="physics-head" r={4.5} cx={PLOT.padding} cy={scale.y(0)} opacity={0} />
      </svg>
      <ul className="physics-key" aria-label="Reference curves">
        {REFERENCES.map(({ zeta: value, name }) => (
          <li key={name}>
            <span className="physics-swatch" aria-hidden="true" />
            <span>
              ζ {plain(value, value === 1 ? 0 : 1)} <span className="physics-muted">{name}</span>
            </span>
          </li>
        ))}
        <li>
          <span className="physics-swatch physics-swatch--current" aria-hidden="true" />
          <span>
            ζ {plain(zeta, 2)} <span className="physics-muted">now</span>
          </span>
        </li>
      </ul>
      <svg className="physics-lane" viewBox={`0 0 ${LANE.width} ${LANE.height}`} aria-hidden="true">
        <line className="physics-axis" x1={laneX(0)} x2={laneX(AXIS.yMax)} y1={LANE.height / 2} y2={LANE.height / 2} />
        <line className="physics-target-tick" x1={laneX(1)} x2={laneX(1)} y1={6} y2={LANE.height - 6} />
        <line className="physics-start-tick" x1={laneX(0)} x2={laneX(0)} y1={6} y2={LANE.height - 6} />
        <circle ref={ball} className="physics-ball" r={BALL_R} cx={laneX(0)} cy={LANE.height / 2} />
      </svg>
      <dl className="physics-readouts physics-readouts--wrap">
        <Readout name="zeta" label="Damping ratio">
          {plain(zeta, 2)}
        </Readout>
        <Readout name="bounce" label="Bounce">
          {plain(bounceFromZeta(zeta), 2)}
        </Readout>
        <Readout name="duration" label="Duration">
          {`${plain(DURATION, 2)} s`}
        </Readout>
        <Readout name="stiffness" label="Stiffness">
          {plain(info.stiffness, 1)}
        </Readout>
        <Readout name="damping" label="Damping">
          {plain(info.damping, 2)}
        </Readout>
        <Readout name="mass" label="Mass">
          {plain(info.mass, 0)}
        </Readout>
        <Readout name="overshoot" label="Overshoot">
          {`${plain(overshoot * 100, 1)} %`}
        </Readout>
        <Readout name="kind" label="Behavior">
          {kind}
        </Readout>
      </dl>
      <p className="physics-live" aria-live="polite">
        {description}
      </p>
      <MotionNote preference={motion} canPlay>
        Replay places the ball at the target at once. The curves and the numbers still update.
      </MotionNote>
    </Figure>
  );
}
