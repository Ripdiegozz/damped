/**
 * The phases of a card that morphs into a dialog. A reversal is not a separate state: asking to close while opening
 * (or to open while closing) goes straight to the opposite moving phase, because the morph keeps its velocity.
 */
export type MorphPhase = "closed" | "opening" | "open" | "closing";
export type MorphEvent = "open" | "close" | "settled";

export const initialMorph: MorphPhase = "closed";

export function morphReducer(phase: MorphPhase, event: MorphEvent): MorphPhase {
  switch (event) {
    case "open":
      return phase === "closed" || phase === "closing" ? "opening" : phase;
    case "close":
      return phase === "open" || phase === "opening" ? "closing" : phase;
    case "settled":
      if (phase === "opening") return "open";
      if (phase === "closing") return "closed";
      return phase;
  }
}

/** True while the dialog is, or is becoming, the visible one. */
export const wantsOpen = (phase: MorphPhase): boolean => phase === "opening" || phase === "open";
