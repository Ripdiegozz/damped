import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { BillCard } from "./BillCard";
import { BILLS, type Bill } from "./bills";
import { countRender } from "./debug";
import { columnCount, nextIndex } from "./grid-nav";

interface BillsViewProps {
  paid: ReadonlySet<string>;
  onPay(bill: Bill, amount: number): void;
}

export function BillsView({ paid, onPay }: BillsViewProps) {
  countRender("bills-grid");
  const grid = useRef<HTMLDivElement>(null);
  // Roving tabindex: the grid is one tab stop, the card that was focused last (the first one at the start).
  const [stop, setStop] = useState(0);

  const cardsOf = () => [...(grid.current?.querySelectorAll<HTMLElement>("[data-bill-card]") ?? [])];

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    // Focus inside a dialog (portaled, but still a child of this grid in React) is not a card getting focus.
    const index = cardsOf().indexOf(event.target as HTMLElement);
    if (index !== -1) setStop(index);
  };

  // Arrow keys follow the layout as it is now: the column count is read from where the cards actually wrapped.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const cards = cardsOf();
    // Events from the dialogs (portaled, but still children of this grid in React) are not grid navigation.
    const index = cards.indexOf(event.target as HTMLElement);
    if (index === -1) return;
    const next = nextIndex(event.key, index, columnCount(cards.map((card) => card.offsetTop)), cards.length);
    if (next === undefined) return;
    event.preventDefault();
    cards[next]?.focus();
  };

  return (
    <div className="bills-grid" role="group" aria-label="Bills" ref={grid} onKeyDown={onKeyDown} onFocus={onFocus}>
      {BILLS.map((bill, index) => (
        <BillCard key={bill.id} bill={bill} paid={paid.has(bill.id)} tabStop={index === stop} onPay={onPay} />
      ))}
    </div>
  );
}
