import { Presence } from "@damped/react";
import { useEffect, useState, type Ref } from "react";
import { RECENT_ACTIVITY, type Transaction } from "./data";
import { formatShortDate, formatSignedCurrency } from "./format";
import { ROW_ENTER } from "./motion";
import { useMotion } from "./motion-context";

/** Delay between two rows appearing. */
const STAGGER_MS = 70;

/**
 * How many of `total` rows are mounted. The core has no per-child delay, so the stagger is made by mounting one more
 * row every `stepMs`: each mount is a discrete state change, and Presence plays the entrance of the row that arrived.
 * With reduced motion every row is mounted at once and enters together (Presence `initial`).
 */
function useStaggeredCount(total: number, stepMs: number, reduced: boolean): number {
  const [count, setCount] = useState(() => (reduced ? total : 0));
  useEffect(() => {
    if (count >= total) return;
    const timer = setTimeout(() => setCount((current) => current + 1), stepMs);
    return () => clearTimeout(timer);
  }, [count, total, stepMs]);
  return count;
}

function ActivityRow({ transaction, ref }: { transaction: Transaction; ref?: Ref<HTMLLIElement> }) {
  const { merchant, category, date, amount } = transaction;
  return (
    <li className="activity-row" ref={ref}>
      <span className="activity-avatar" aria-hidden="true">
        {merchant.charAt(0)}
      </span>
      <span className="activity-text">
        <span className="activity-merchant">{merchant}</span>
        <span className="activity-category">{category}</span>
      </span>
      <time className="activity-date" dateTime={date}>
        {formatShortDate(date)}
      </time>
      <span className={amount >= 0 ? "amount positive" : "amount negative"}>{formatSignedCurrency(amount)}</span>
    </li>
  );
}

export function RecentActivity() {
  const { spring, reduced } = useMotion();
  const count = useStaggeredCount(RECENT_ACTIVITY.length, STAGGER_MS, reduced);
  return (
    <ul className="activity-list" role="list" aria-label="Recent activity">
      <Presence initial enter={ROW_ENTER} options={spring("row")}>
        {RECENT_ACTIVITY.slice(0, count).map((transaction) => (
          <ActivityRow key={transaction.id} transaction={transaction} />
        ))}
      </Presence>
    </ul>
  );
}
