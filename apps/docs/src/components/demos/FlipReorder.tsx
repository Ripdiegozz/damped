import { layout } from "@damped/core";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MERCHANTS, shuffled, sortedByAmount, sortedByName, type Merchant } from "./list-order";
import { MotionNote, useDemoState, useMotionPreference } from "./motion";

const SPRING = { duration: 0.55, bounce: 0.12 } as const;

const dollars = (amount: number): string => `$${amount.toFixed(2)}`;

/**
 * Reorders a list and animates every row from where it was to where it is now (FLIP) with `layout()`: the previous
 * boxes are recorded, React commits the new order synchronously, and damped springs each row back to the identity.
 * Pressing a button again mid-flight retargets the rows and keeps their velocity.
 *
 * Reduced motion: damped makes the rows jump to their new place.
 */
export function FlipReorder() {
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const tracker = useDemoState(root);
  const motion = useMotionPreference();
  const [items, setItems] = useState<readonly Merchant[]>(MERCHANTS);
  const [status, setStatus] = useState("Original order.");

  const apply = (next: readonly Merchant[], message: string): void => {
    const rows = Array.from(list.current?.children ?? []);
    setStatus(message);
    const controls = layout(
      rows,
      () => {
        // Committed before layout() measures the new boxes.
        flushSync(() => setItems(next));
      },
      SPRING,
    );
    void tracker.track(controls.finished.then(() => true));
  };

  return (
    <div ref={root} className="not-content demo" data-demo="flip-reorder" data-state="idle" data-runs="0" role="group" aria-label="Reorder a list with FLIP">
      <p className="demo-title">Reorder a list</p>
      <div className="demo-actions">
        <button type="button" className="demo-button demo-button--primary" onClick={() => apply(shuffled(items), "Shuffled.")}>
          Shuffle
        </button>
        <button type="button" className="demo-button" onClick={() => apply(sortedByName(items), "Sorted by name, A to Z.")}>
          Sort by name
        </button>
        <button type="button" className="demo-button" onClick={() => apply(sortedByAmount(items), "Sorted by amount, largest first.")}>
          Sort by amount
        </button>
        <button type="button" className="demo-button" onClick={() => apply(MERCHANTS, "Original order.")}>
          Reset
        </button>
      </div>
      <ul ref={list} className="flip-list" aria-label="Monthly bills">
        {items.map((item) => (
          <li key={item.id} className="flip-row">
            <span className="flip-avatar" aria-hidden="true">
              {item.name.charAt(0)}
            </span>
            <span className="flip-name">{item.name}</span>
            <span className="flip-amount">{dollars(item.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="demo-status" aria-live="polite">
        {status}
      </p>
      <MotionNote preference={motion}>The rows jump to their new place instead of moving there.</MotionNote>
    </div>
  );
}
