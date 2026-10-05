import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject, type Ref } from "react";
import { CompositorDemo } from "./CompositorDemo";
import { BOUNCE_RANGE, DURATION_RANGE } from "./motion";
import { useMotion } from "./motion-context";
import { anchorPopover } from "./popover";
import { useMergedRef } from "./use-merged-ref";

const PANEL_WIDTH_PX = 340;

interface SpringLabProps {
  /** The button that opens the lab: the panel hangs under it, and clicks on it are its own business. */
  anchor: RefObject<HTMLElement | null>;
  onClose(): void;
  /** <Presence> animates the aside it receives through `ref`. */
  ref?: Ref<HTMLElement>;
}

function place(anchor: HTMLElement | null) {
  const { innerWidth, innerHeight } = window;
  const box = anchor?.getBoundingClientRect() ?? { right: innerWidth, bottom: 0 };
  return anchorPopover(box, { width: innerWidth, height: innerHeight }, { width: PANEL_WIDTH_PX });
}

/** The popover that changes how the whole app moves. */
export function SpringLab({ anchor, onClose, ref }: SpringLabProps) {
  const { settings, update, reset, systemReducedMotion } = useMotion();
  const panel = useRef<HTMLElement | null>(null);
  const setPanel = useMergedRef<HTMLElement>(
    (node) => {
      panel.current = node;
    },
    ref,
  );
  const [placement, setPlacement] = useState(() => place(anchor.current));
  const close = useRef(onClose);
  close.current = onClose;
  const durationId = useId();
  const durationInput = useRef<HTMLInputElement>(null);
  const bounceId = useId();
  // The anchor moves with the window, and so does the popover.
  useLayoutEffect(() => {
    const onResize = () => setPlacement(place(anchor.current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [anchor]);

  // A popover, not a dialog: focus moves in when it opens, Escape closes it and gives focus back to the button, and
  // so does a click anywhere else. A click on the button is left to the button, which toggles the popover itself.
  useEffect(() => {
    durationInput.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close.current();
      anchor.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      close.current();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchor]);

  return createPortal(
    <aside
      id="spring-lab"
      className="lab"
      aria-label="Spring lab"
      ref={setPanel}
      style={{ top: placement.top, right: placement.right, width: placement.width, maxHeight: placement.maxHeight }}
    >
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
          ref={durationInput}
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
          aria-valuetext={`bounce ${settings.bounce.toFixed(2)}`}
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
