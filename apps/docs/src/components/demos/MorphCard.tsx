import { useMorph, useSpring } from "@damped/react";
import { useCallback, useEffect, useId, useRef, type KeyboardEvent } from "react";
import { MotionNote, useDemoState, useMotionPreference } from "./motion";
import { initialMorph, morphReducer, wantsOpen, type MorphEvent, type MorphPhase } from "./morph-machine";

const MORPH = { duration: 0.5, bounce: 0.1, radius: 16 } as const;
const BACKDROP = { duration: 0.3, bounce: 0 } as const;
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";

export interface MorphCardProps {
  /** `compact` is a smaller stage, for tight spaces such as the landing hero. */
  variant?: "default" | "compact";
  className?: string;
  /** Called when a morph toward open or closed starts (not when it settles). */
  onOpenChange?(open: boolean): void;
}

/**
 * A bill card that turns into its dialog (shared-element morph with `useMorph`). Open it, then close it with the
 * button, the backdrop or Escape while it is still opening: the morph reverses from where it is and keeps its
 * velocity. Focus moves into the dialog when it opens and back to the card when it closes.
 *
 * Both elements stay mounted inside one stage, so the demo needs no portal and renders on the server. Reduced
 * motion: damped makes the geometry jump; the crossfade stays.
 */
export function MorphCard({ variant = "default", className, onOpenChange }: MorphCardProps) {
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLButtonElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const phase = useRef<MorphPhase>(initialMorph);
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const { source, target, open, close, isOpen } = useMorph(MORPH);
  const backdrop = useSpring<HTMLDivElement>({ opacity: isOpen ? 1 : 0 }, BACKDROP);
  const titleId = useId();
  const noteId = useId();

  const setCard = useCallback(
    (node: HTMLButtonElement | null) => {
      card.current = node;
      source(node);
    },
    [source],
  );
  const setDialog = useCallback(
    (node: HTMLDivElement | null) => {
      dialog.current = node;
      target(node);
    },
    [target],
  );

  const dispatch = (event: MorphEvent): void => {
    phase.current = morphReducer(phase.current, event);
    root.current?.setAttribute("data-phase", phase.current);
  };

  const request = (want: "open" | "close"): void => {
    const before = phase.current;
    dispatch(want);
    if (phase.current === before) return;
    onOpenChange?.(want === "open");
    const finished = want === "open" ? open() : close();
    // Only a morph that settled (not one that was reversed) moves the phase on.
    void tracker.track(finished).then((settled) => {
      if (settled) dispatch("settled");
    });
    // Back on the card at once: the dialog is inert while it travels back, and Enter on the card reverses it.
    if (want === "close") card.current?.focus({ preventScroll: true });
  };

  // Focus moves into the dialog when it opens, including when a closing dialog is reversed.
  useEffect(() => {
    if (!isOpen) return;
    const first = dialog.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog.current)?.focus({ preventScroll: true });
  }, [isOpen]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape" && wantsOpen(phase.current)) {
      event.preventDefault();
      request("close");
      return;
    }
    const container = dialog.current;
    if (event.key !== "Tab" || container === null || !wantsOpen(phase.current)) return;
    const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (!container.contains(active) || (event.shiftKey && active === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={root}
      className={["not-content", "demo", "morph-demo", variant === "compact" ? "morph-demo--compact" : "", className ?? ""].filter(Boolean).join(" ")}
      data-demo="morph-card"
      data-state="idle"
      data-runs="0"
      data-phase="closed"
      role="group"
      aria-label="A card that morphs into a dialog"
      onKeyDown={onKeyDown}
    >
      <div className="morph-stage">
        <button type="button" ref={setCard} className="morph-card" aria-haspopup="dialog" aria-expanded={isOpen} onClick={() => request("open")}>
          {/* One child holds everything: morph() corrects and blurs the direct children of the card. */}
          <span className="morph-card__body">
            <span className="morph-card__row">
              <span className="morph-card__name">City Power</span>
              <span className="morph-card__badge">Due in 5 days</span>
            </span>
            <span className="morph-card__amount">$84.20</span>
            <span className="morph-card__meta">Electricity, June</span>
            <span className="morph-card__hint">Open the bill</span>
          </span>
        </button>
        <div ref={backdrop} className="morph-backdrop" data-open={isOpen} aria-hidden="true" onClick={() => request("close")} />
        <div ref={setDialog} className="morph-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={noteId} tabIndex={-1}>
          <div className="morph-dialog__body">
            <div className="morph-dialog__head">
              <div>
                <p id={titleId} className="morph-dialog__title">
                  City Power
                </p>
                <p className="morph-dialog__meta">Bill for John Doe</p>
              </div>
              <button type="button" className="morph-dialog__close" aria-label="Close the bill" onClick={() => request("close")}>
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <p className="morph-dialog__amount">$84.20</p>
            <dl className="morph-dialog__rows">
              <div>
                <dt>Usage</dt>
                <dd>312 kWh</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>Jun 1 to Jun 30</dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>Jul 5</dd>
              </div>
            </dl>
            <p id={noteId} className="morph-dialog__note">
              Press Escape or Close, even while it is still opening. It reverses from where it is.
            </p>
            <div className="morph-dialog__actions">
              <button type="button" className="demo-button" onClick={() => request("close")}>
                Close
              </button>
              <button type="button" className="demo-button demo-button--primary" onClick={() => request("close")}>
                Pay now
              </button>
            </div>
          </div>
        </div>
      </div>
      <MotionNote preference={motion}>The card and the dialog swap places without travelling. Only the crossfade stays.</MotionNote>
    </div>
  );
}
