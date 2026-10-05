export interface PopoverPlacement {
  /** Distance from the top of the viewport. */
  top: number;
  /** Distance from the right edge of the viewport. */
  right: number;
  /** The panel's width: its own, or what the viewport leaves when it is narrower. */
  width: number;
  /** What is left of the viewport below the panel's top. */
  maxHeight: number;
}

/**
 * Places a panel under a button, right-aligned to it, with a gap. The panel stays inside the viewport: on a narrow
 * screen it shrinks to fit and slides left until its left edge reaches the margin.
 */
export function anchorPopover(
  button: { right: number; bottom: number },
  viewport: { width: number; height: number },
  panel: { width: number; gap?: number; margin?: number },
): PopoverPlacement {
  const { gap = 8, margin = 8 } = panel;
  const width = Math.min(panel.width, viewport.width - 2 * margin);
  const top = button.bottom + gap;
  const right = Math.min(Math.max(viewport.width - button.right, margin), viewport.width - width - margin);
  return { top, right, width, maxHeight: Math.max(viewport.height - top - margin, 0) };
}
