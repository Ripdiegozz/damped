import { createPortal } from "react-dom";
import { useId, type Ref } from "react";
import { CompositorDemo } from "./CompositorDemo";
import { BOUNCE_RANGE, DURATION_RANGE } from "./motion";
import { useMotion } from "./motion-context";

/** The floating panel that changes how the whole app moves. <Presence> animates the aside it receives through `ref`. */
export function SpringLab({ ref }: { ref?: Ref<HTMLElement> }) {
  const { settings, update, reset, systemReducedMotion } = useMotion();
  const durationId = useId();
  const bounceId = useId();
  return createPortal(
    <aside id="spring-lab" className="lab" aria-label="Spring lab" ref={ref}>
      <h2>Spring lab</h2>

      <div className="lab-field">
        <div className="lab-label">
          <label htmlFor={durationId}>Duration</label>
          <output htmlFor={durationId} data-lab-value="duration">
            {settings.duration.toFixed(2)} s
          </output>
        </div>
        <input
          id={durationId}
          type="range"
          {...DURATION_RANGE}
          value={settings.duration}
          aria-valuetext={`${settings.duration.toFixed(2)} seconds`}
          onChange={(event) => update({ duration: Number(event.target.value) })}
        />
      </div>

      <div className="lab-field">
        <div className="lab-label">
          <label htmlFor={bounceId}>Bounce</label>
          <output htmlFor={bounceId} data-lab-value="bounce">
            {settings.bounce.toFixed(2)}
          </output>
        </div>
        <input
          id={bounceId}
          type="range"
          {...BOUNCE_RANGE}
          value={settings.bounce}
          aria-valuetext={settings.bounce.toFixed(2)}
          onChange={(event) => update({ bounce: Number(event.target.value) })}
        />
      </div>
      <p className="lab-hint">These apply to every animation in the app. Bounce moves things; fades and counting numbers never overshoot.</p>

      <label className="lab-switch">
        <input type="checkbox" role="switch" checked={settings.slowMotion} onChange={(event) => update({ slowMotion: event.target.checked })} />
        <span>Slow motion (×4 duration)</span>
      </label>
      <label className="lab-switch">
        <input type="checkbox" role="switch" checked={settings.reducedMotion} onChange={(event) => update({ reducedMotion: event.target.checked })} />
        <span>Simulate reduced motion</span>
      </label>
      <p className="lab-hint">
        System preference: <strong data-os-reduced>{systemReducedMotion ? "Reduce" : "No preference"}</strong>
      </p>

      <button type="button" className="button" onClick={reset}>
        Reset
      </button>

      <CompositorDemo />
    </aside>,
    document.body,
  );
}
