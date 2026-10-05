import { Presence, useLayout } from "@damped/react";
import { useEffect, useRef, useState, type Ref } from "react";
import { AnimatedNumber } from "./AnimatedNumber";
import { CATEGORY_FILTERS, SORTS, netTotal, type ActivityFilter, type ActivityItem, type ActivitySort } from "./activity";
import { formatShortDate, formatSignedCurrency } from "./format";
import { ACTIVITY_ROW_ENTER, ACTIVITY_ROW_EXIT } from "./motion";
import { useMotion } from "./motion-context";
import { useMergedRef } from "./use-merged-ref";

const CHIPS: readonly { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "income", label: "Income" },
  { id: "expenses", label: "Expenses" },
  ...CATEGORY_FILTERS.map((category) => ({ id: category, label: category })),
];

interface RowProps {
  item: ActivityItem;
  /** Position in the list as it is shown. */
  index: number;
  /** Counts the rows that finished leaving; see ToastItem for why it is a dependency. */
  reflowKey: number;
  onDelete(item: ActivityItem): void;
  ref?: Ref<HTMLLIElement>;
}

function TransactionRow({ item, index, reflowKey, onDelete, ref }: RowProps) {
  // FLIP: a row that changes position (sort, a filter, a row added above it) springs from where it was to where it is.
  // Rows leaving through <Presence> stay in the flow until they are gone, so the others move when `reflowKey` changes.
  const { spring } = useMotion();
  const layoutRef = useLayout<HTMLLIElement>([index, reflowKey], spring("stack"));
  const setRow = useMergedRef(layoutRef, ref);
  const date = formatShortDate(item.date);
  return (
    <li className="tx-row" ref={setRow} data-activity-row={item.id}>
      <span className="activity-avatar" aria-hidden="true">
        {item.merchant.charAt(0)}
      </span>
      <span className="activity-text">
        <span className="activity-merchant">{item.merchant}</span>
        <span className="activity-category">{item.category}</span>
      </span>
      <span className="tx-who">{item.who === "John Doe" ? "John" : "Jane"}</span>
      <time className="activity-date" dateTime={item.date}>
        {date}
      </time>
      <span className={item.amount >= 0 ? "amount positive" : "amount negative"}>{formatSignedCurrency(item.amount)}</span>
      <button type="button" className="tx-delete" data-delete={item.id} aria-label={`Delete ${item.merchant}, ${date}`} onClick={() => onDelete(item)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      </button>
    </li>
  );
}

interface ActivityViewProps {
  /** The transactions to show, already filtered and sorted. */
  items: readonly ActivityItem[];
  filter: ActivityFilter;
  sort: ActivitySort;
  onFilter(filter: ActivityFilter): void;
  onSort(sort: ActivitySort): void;
  onAdd(): void;
  onDelete(item: ActivityItem): void;
}

export function ActivityView({ items, filter, sort, onFilter, onSort, onAdd, onDelete }: ActivityViewProps) {
  const { spring } = useMotion();
  const [gone, setGone] = useState(0);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusAfterDelete = useRef<string | null>(null);

  // A deleted row takes focus with it; hand it to the row that is next to it, or to "Add transaction" when none is left.
  useEffect(() => {
    const id = focusAfterDelete.current;
    if (id === null) return;
    focusAfterDelete.current = null;
    const next = id === "" ? null : document.querySelector<HTMLElement>(`[data-delete="${id}"]`);
    (next ?? addButton.current)?.focus();
  });

  const remove = (item: ActivityItem) => {
    const at = items.findIndex((entry) => entry.id === item.id);
    focusAfterDelete.current = (items[at + 1] ?? items[at - 1])?.id ?? "";
    onDelete(item);
  };

  return (
    <div className="activity-view">
      <div className="card activity-summary">
        <p className="net" data-net>
          Net: <AnimatedNumber className="net-value" value={netTotal(items)} format={formatSignedCurrency} />
        </p>
        <button type="button" className="button primary" data-add-transaction ref={addButton} onClick={onAdd}>
          Add transaction
        </button>
      </div>

      <div className="activity-controls">
        <div className="chips" role="group" aria-label="Filter transactions">
          {CHIPS.map((chip) => (
            <button key={chip.id} type="button" className="chip-toggle" aria-pressed={filter === chip.id} onClick={() => onFilter(chip.id)}>
              {chip.label}
            </button>
          ))}
        </div>
        <label className="sort">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => onSort(event.target.value as ActivitySort)}>
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="card tx-card">
        <ul className="tx-list" role="list" aria-label="Transactions">
          <Presence enter={ACTIVITY_ROW_ENTER} exit={ACTIVITY_ROW_EXIT} options={spring("row")} onExitComplete={() => setGone((count) => count + 1)}>
            {items.map((item, index) => (
              <TransactionRow key={item.id} item={item} index={index} reflowKey={gone} onDelete={remove} />
            ))}
          </Presence>
        </ul>
        {items.length === 0 && <p className="tx-empty">No transactions match this filter.</p>}
      </section>
    </div>
  );
}
