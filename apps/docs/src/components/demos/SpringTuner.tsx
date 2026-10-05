import { useSpringValue } from "@damped/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MotionNote, useDemoState, useMotionPreference } from "./motion";
import { curvePath, describeSpring, plotScale, sampleCurve, type PlotBox } from "./spring-curve";

const PLOT: PlotBox = { width: 360, height: 168, padding: 22 };
const SAMPLES = 120;
const BALL_PX = 24;

const fixed = (value: number, digits: number): string => value.toFixed(digits);

/**
 * `bounce` and `duration` are the perceptual parameters of a spring. The sliders redraw the analytic curve of that
 * spring (a slider change is state; nothing re-renders per frame), and Replay runs a real spring value with the
 * same options, so the ball and the playhead follow the curve exactly.
 *
 * Reduced motion: Replay puts the ball at the end at once; the curve and the numbers still update. "Play anyway"
 * runs the spring.
 */
export function SpringTuner() {
  const root = useRef<HTMLDivElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const ball = useRef<HTMLSpanElement>(null);
  const head = useRef<SVGCircleElement>(null);
  const [bounce, setBounce] = useState(0.2);
  const [duration, setDuration] = useState(0.6);
  const bounceId = useId();
  const durationId = useId();

  const motion = useMotionPreference();
  const tracker = useDemoState(root);
  const progress = useSpringValue(0);
  const curve = useMemo(() => sampleCurve({ bounce, duration }, SAMPLES), [bounce, duration]);
  const info = useMemo(() => describeSpring({ bounce, duration }), [bounce, duration]);
  const scale = useMemo(() => plotScale(curve, PLOT), [curve]);
  const latest = useRef({ scale, curve });
  latest.current = { scale, curve };
  const started = useRef(0);

  useEffect(() => {
    const unsubscribe = progress.onChange((value) => {
      const track = lane.current;
      if (track && ball.current) ball.current.style.transform = `translate3d(${value * Math.max(0, track.clientWidth - BALL_PX)}px,0,0)`;
      const dot = head.current;
      if (!dot) return;
      const elapsed = (performance.now() - started.current) / 1000;
      const { scale: current, curve: shown } = latest.current;
      dot.setAttribute("cx", String(current.x(Math.min(elapsed, shown.tMax))));
      dot.setAttribute("cy", String(current.y(value)));
    });
    return unsubscribe;
  }, [progress]);

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
    void tracker.track(progress.set(1, { bounce, duration }));
  };

  const description = `Spring position over time, from 0 to 1. ${info.kind}. It settles after ${fixed(info.settleTime, 2)} seconds${
    curve.yMax > 1.005 ? ` and overshoots to ${fixed(curve.yMax, 2)}` : " without overshooting"
  }.`;

  return (
    <div ref={root} className="not-content demo" data-demo="spring-tuner" data-state="idle" data-runs="0" role="group" aria-label="Tune a spring with bounce and duration">
      <p className="demo-title">Tune a spring</p>
      <div className="tuner-controls">
        <div className="demo-field">
          <label htmlFor={bounceId}>
            Bounce <output htmlFor={bounceId}>{fixed(bounce, 2)}</output>
          </label>
          <input
            id={bounceId}
            type="range"
            min={-0.5}
            max={0.9}
            step={0.05}
            value={bounce}
            onChange={(event) => {
              rewind();
              setBounce(Number(event.target.value));
            }}
          />
        </div>
        <div className="demo-field">
          <label htmlFor={durationId}>
            Duration <output htmlFor={durationId}>{fixed(duration, 2)} s</output>
          </label>
          <input
            id={durationId}
            type="range"
            min={0.1}
            max={2}
            step={0.05}
            value={duration}
            onChange={(event) => {
              rewind();
              setDuration(Number(event.target.value));
            }}
          />
        </div>
        <button type="button" className="demo-button demo-button--primary" onClick={replay}>
          Replay
        </button>
      </div>
      <svg className="tuner-plot" viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} role="img" aria-label={description}>
        <line className="plot-axis" x1={PLOT.padding} x2={PLOT.width - PLOT.padding} y1={scale.y(0)} y2={scale.y(0)} />
        <line className="plot-target" x1={PLOT.padding} x2={PLOT.width - PLOT.padding} y1={scale.y(1)} y2={scale.y(1)} />
        <line className="plot-mark" x1={scale.x(duration)} x2={scale.x(duration)} y1={PLOT.padding - 6} y2={PLOT.height - PLOT.padding} />
        <text className="plot-label" x={scale.x(duration)} y={PLOT.padding - 9} textAnchor="middle">
          {`duration ${fixed(duration, 2)} s`}
        </text>
        <text className="plot-label" x={PLOT.width - PLOT.padding} y={scale.y(1) - 5} textAnchor="end">
          target
        </text>
        <path className="plot-curve" d={curvePath(curve, PLOT)} />
        <circle ref={head} className="plot-head" r={4.5} cx={PLOT.padding} cy={scale.y(0)} opacity={0} />
        <text className="plot-label" x={PLOT.width - PLOT.padding} y={PLOT.height - 6} textAnchor="end">
          {`settles ${fixed(info.settleTime, 2)} s`}
        </text>
      </svg>
      <div ref={lane} className="tuner-lane" aria-hidden="true">
        <span ref={ball} className="tuner-ball" />
      </div>
      <dl className="demo-readouts demo-readouts--wrap">
        <div>
          <dt>Stiffness</dt>
          <dd>{fixed(info.stiffness, 1)}</dd>
        </div>
        <div>
          <dt>Damping</dt>
          <dd>{fixed(info.damping, 2)}</dd>
        </div>
        <div>
          <dt>Mass</dt>
          <dd>{fixed(info.mass, 0)}</dd>
        </div>
        <div>
          <dt>Behavior</dt>
          <dd>{info.kind}</dd>
        </div>
      </dl>
      <MotionNote preference={motion} canPlay>
        Replay places the ball at the end at once. The curve and the numbers still update.
      </MotionNote>
    </div>
  );
}
