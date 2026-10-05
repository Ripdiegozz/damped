import { useSpringValue } from "@damped/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MotionNote, useDemoState, useMotionPreference } from "../demos/motion";
import { Figure } from "./figure";
import { signed } from "./format";
import { retarget, type LaneMode } from "./retarget";
import { createSeries } from "./series";

const OPTIONS = { duration: 0.6, bounce: 0.25, restDelta: 0.002, restSpeed: 0.02 } as const;
const RANGE = { min: -0.15, max: 1.25 } as const;
const WINDOW_MS = 2000;
const LANES = { width: 560, height: 96, padding: 24 } as const;
const PLOT = { width: 560, height: 170 } as const;
const SPEED_PLOT = { width: 560, height: 120 } as const;
const SPEED_RANGE = { min: -4, max: 4 } as const;
const BALL_R = 8;
const DASH = "–";
// Each press moves the target on to the next stop; the last one goes back to the start. Interrupting a lane that is
// heading right with a target further right is where an animation that restarts stalls and a spring does not.
const STOPS = [0, 0.5, 1] as const;

const laneX = (value: number): number => LANES.padding + ((value - RANGE.min) / (RANGE.max - RANGE.min)) * (LANES.width - 2 * LANES.padding);
const rows: { mode: LaneMode; y: number; label: string }[] = [
  { mode: "restart", y: 30, label: "restart" },
  { mode: "damped", y: 70, label: "damped" },
];
const plotY = (value: number): number => PLOT.height * ((RANGE.max - value) / (RANGE.max - RANGE.min));
const perSecond = (velocity: number): string => `${signed(velocity, 2)} /s`;

/**
 * Two identical springs, one button. The damped lane is a plain retarget: the new spring starts from the position and
 * the velocity the value had. The restart lane is what an easing curve does: it jumps to the same position, which
 * drops its velocity, and starts a new spring from rest. Press the button while they move and compare the traces.
 *
 * Reduced motion: both lanes jump to their target, so there is no velocity to compare.
 */
export function Interruption() {
  const root = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLParagraphElement>(null);
  const balls = useRef<Record<LaneMode, SVGCircleElement | null>>({ restart: null, damped: null });
  const lines = useRef<Record<LaneMode, SVGPathElement | null>>({ restart: null, damped: null });
  const speedLines = useRef<Record<LaneMode, SVGPathElement | null>>({ restart: null, damped: null });
  const ticks = useRef<SVGPathElement>(null);
  const speedTicks = useRef<SVGPathElement>(null);
  const cells = useRef<Record<string, HTMLElement | null>>({});

  const restart = useSpringValue(0);
  const damped = useSpringValue(0);
  const values: Record<LaneMode, typeof restart> = { restart, damped };
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const [series] = useState<Record<LaneMode, ReturnType<typeof createSeries>>>(() => ({ restart: createSeries(WINDOW_MS), damped: createSeries(WINDOW_MS) }));
  const [speeds] = useState<Record<LaneMode, ReturnType<typeof createSeries>>>(() => ({ restart: createSeries(WINDOW_MS), damped: createSeries(WINDOW_MS) }));
  const stop = useRef(0);
  const [label, setLabel] = useState("Send both to the right");

  const say = (text: string): void => {
    if (live.current) live.current.textContent = text;
  };
  const write = (name: string, text: string): void => {
    const cell = cells.current[name];
    if (cell) cell.textContent = text;
  };

  useEffect(() => {
    const off = rows.map(({ mode }) =>
      values[mode].onChange((x, speed) => {
        balls.current[mode]?.setAttribute("cx", String(laneX(x)));
        write(`${mode}-now`, perSecond(speed));
        const now = performance.now();
        series[mode].push(now, x);
        const drawn = series[mode].path(PLOT, RANGE, now);
        lines.current[mode]?.setAttribute("d", drawn.line);
        speeds[mode].push(now, speed);
        const drawnSpeed = speeds[mode].path(SPEED_PLOT, SPEED_RANGE, now);
        speedLines.current[mode]?.setAttribute("d", drawnSpeed.line);
        // Both lanes are interrupted together, so one set of ticks serves both.
        if (mode === "damped") {
          ticks.current?.setAttribute("d", drawn.marks);
          speedTicks.current?.setAttribute("d", drawnSpeed.marks);
        }
      }),
    );
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, [restart, damped]);

  const labelFor = (index: number): string => {
    const next = (index + 1) % STOPS.length;
    if (next === 0) return "Retarget both back to the left";
    return index === 0 ? "Send both to the right" : "Retarget both further right";
  };

  const go = (): void => {
    stop.current = (stop.current + 1) % STOPS.length;
    const next = STOPS[stop.current]!;
    const forward = stop.current !== 0;
    const now = performance.now();
    if (motion.still) {
      for (const { mode } of rows) values[mode].jump(next);
      for (const { mode } of rows) void tracker.track(Promise.resolve(true));
      say("Reduced motion is on: both lanes jumped, so there is no velocity to compare.");
    } else {
      for (const { mode } of rows) {
        series[mode].mark(now);
        speeds[mode].mark(now);
      }
      const results = rows.map(({ mode }) => ({ mode, ...retarget(values[mode], mode, next, OPTIONS) }));
      for (const { mode, before, after, finished } of results) {
        write(`${mode}-before`, perSecond(before));
        write(`${mode}-after`, perSecond(after));
        void tracker.track(finished);
      }
      const speed = results[0]!.before;
      const where = forward ? "further right" : "back to the left";
      say(
        Math.abs(speed) > 0.05
          ? `Retargeted both lanes ${where} while moving at ${perSecond(speed)}. The restart lane began again from rest; the damped lane kept ${perSecond(speed)}.`
          : `Sent both lanes ${where} from rest. Press again while they move.`,
      );
      void Promise.all(results.map((result) => result.finished)).then((all) => {
        if (all.every(Boolean) && !values.damped.animating && !values.restart.animating) say("Both lanes are at rest.");
      });
    }
    setLabel(labelFor(stop.current));
  };

  const reset = (): void => {
    for (const { mode } of rows) {
      values[mode].jump(0);
      series[mode].clear();
      speeds[mode].clear();
      lines.current[mode]?.setAttribute("d", "");
      speedLines.current[mode]?.setAttribute("d", "");
      write(`${mode}-before`, DASH);
      write(`${mode}-after`, DASH);
    }
    ticks.current?.setAttribute("d", "");
    speedTicks.current?.setAttribute("d", "");
    stop.current = 0;
    setLabel(labelFor(0));
    say("Both lanes are back at the left, at rest.");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key.toLowerCase() !== "r" || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    go();
  };

  const cell = (name: string, initial: string) => (
    <td ref={(element) => void (cells.current[name] = element)} data-readout={name}>
      {initial}
    </td>
  );

  return (
    <div onKeyDown={onKeyDown} className="not-content physics-boundary">
      <Figure ref={root} demo="physics-interruption" title="Interrupting a spring">
        <svg className="physics-lanes" viewBox={`0 0 ${LANES.width} ${LANES.height}`} aria-hidden="true">
          {rows.map(({ mode, y, label: name }) => (
            <g key={mode}>
              <text className="physics-label" x={LANES.padding} y={y - 14}>
                {name}
              </text>
              <line className="physics-axis" x1={laneX(0)} x2={laneX(1)} y1={y} y2={y} />
              {STOPS.map((value) => (
                <line key={value} className="physics-start-tick" x1={laneX(value)} x2={laneX(value)} y1={y - 8} y2={y + 8} />
              ))}
              <circle ref={(element) => void (balls.current[mode] = element)} className="physics-ball" r={BALL_R} cx={laneX(0)} cy={y} />
            </g>
          ))}
        </svg>
        <div className="physics-actions">
          <button type="button" className="demo-button demo-button--primary" aria-keyshortcuts="R" onClick={go}>
            {label}
          </button>
          <button type="button" className="demo-button" onClick={reset}>
            Reset
          </button>
          <span className="physics-muted">or press R</span>
        </div>
        <p className="physics-plot-label">Position</p>
        <svg className="physics-plot" viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} preserveAspectRatio="none" role="img" aria-label="Position of both lanes over the last two seconds. Vertical ticks mark each retarget.">
          <line className="physics-axis" x1={0} x2={PLOT.width} y1={plotY(0)} y2={plotY(0)} />
          {STOPS.slice(1).map((value) => (
            <line key={value} className="physics-target" x1={0} x2={PLOT.width} y1={plotY(value)} y2={plotY(value)} />
          ))}
          <path ref={ticks} className="physics-ticks" />
          <path ref={(element) => void (lines.current.restart = element)} className="physics-restart-line" />
          <path ref={(element) => void (lines.current.damped = element)} className="physics-damped-line" />
        </svg>
        <p className="physics-plot-label">Velocity</p>
        <svg className="physics-plot physics-plot--speed" viewBox={`0 0 ${SPEED_PLOT.width} ${SPEED_PLOT.height}`} preserveAspectRatio="none" role="img" aria-label="Velocity of both lanes over the last two seconds. The restart line drops to zero at each retarget, the damped line carries on without a jump.">
          <line className="physics-axis" x1={0} x2={SPEED_PLOT.width} y1={SPEED_PLOT.height / 2} y2={SPEED_PLOT.height / 2} />
          <path ref={speedTicks} className="physics-ticks" />
          <path ref={(element) => void (speedLines.current.restart = element)} className="physics-restart-line" />
          <path ref={(element) => void (speedLines.current.damped = element)} className="physics-damped-line" />
        </svg>
        <ul className="physics-key" aria-label="Lines">
          <li>
            <span className="physics-swatch physics-swatch--ink" aria-hidden="true" />
            <span>
              restart <span className="physics-muted">starts again from rest</span>
            </span>
          </li>
          <li>
            <span className="physics-swatch physics-swatch--current" aria-hidden="true" />
            <span>
              damped <span className="physics-muted">keeps its velocity</span>
            </span>
          </li>
        </ul>
        <table className="physics-table">
          <caption>Velocity of each lane, in lengths per second</caption>
          <thead>
            <tr>
              <th scope="col">Lane</th>
              <th scope="col">Now</th>
              <th scope="col">At the interruption</th>
              <th scope="col">Right after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ mode, label: name }) => (
              <tr key={mode}>
                <th scope="row">{name}</th>
                {cell(`${mode}-now`, perSecond(0))}
                {cell(`${mode}-before`, DASH)}
                {cell(`${mode}-after`, DASH)}
              </tr>
            ))}
          </tbody>
        </table>
        <p ref={live} className="physics-live" aria-live="polite">
          Both lanes are at rest. Press the button, then press it again while they move.
        </p>
        <MotionNote preference={motion} canPlay>
          Both lanes jump to the target, so there is no velocity to compare.
        </MotionNote>
      </Figure>
    </div>
  );
}
