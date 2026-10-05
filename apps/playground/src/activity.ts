import type { Transaction } from "./data";

// All transactions are invented. John Doe owns the joint account; Jane Doe is his partner and shares it.

export type Person = "John Doe" | "Jane Doe";

export interface ActivityItem extends Transaction {
  who: Person;
}

export type ActivitySort = "newest" | "oldest" | "amount";
/** A chip: everything, income only, expenses only, or one category. */
export type ActivityFilter = "all" | "income" | "expenses" | (string & {});

/** The app's "today", so the data never depends on the real clock. */
export const TODAY = "2026-10-05";

export const CATEGORY_FILTERS = ["Groceries", "Dining", "Utilities", "Transport"] as const;

export const SORTS: readonly { id: ActivitySort; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
  { id: "amount", label: "Amount" },
];

const t = (id: string, date: string, merchant: string, category: string, amount: number, who: Person): ActivityItem => ({
  id: `a-${id}`,
  merchant,
  category,
  date,
  amount,
  who,
});

export const ACTIVITY: readonly ActivityItem[] = [
  t("027", "2026-10-04", "Corner Grocery", "Groceries", -62.14, "John Doe"),
  t("026", "2026-10-03", "Sunrise Bakery", "Dining", -14.85, "Jane Doe"),
  t("025", "2026-10-02", "Jane Doe", "Transfer", 120, "Jane Doe"),
  t("024", "2026-10-01", "Brightline Studio", "Salary", 3850, "John Doe"),
  t("023", "2026-10-01", "Oak Street Apartments", "Rent", -1850, "John Doe"),
  t("022", "2026-09-30", "City Power", "Utilities", -94.3, "John Doe"),
  t("021", "2026-09-29", "Metro Transit", "Transport", -64, "Jane Doe"),
  t("020", "2026-09-28", "Northside Pharmacy", "Health", -27.6, "Jane Doe"),
  t("019", "2026-09-27", "Corner Grocery", "Groceries", -88.42, "Jane Doe"),
  t("018", "2026-09-26", "Blue Gym", "Fitness", -39, "John Doe"),
  t("017", "2026-09-25", "Harbor Insurance", "Insurance", -182.4, "John Doe"),
  t("016", "2026-09-24", "FiberNet", "Utilities", -59.99, "John Doe"),
  t("015", "2026-09-23", "Sunrise Bakery", "Dining", -9.5, "John Doe"),
  t("014", "2026-09-22", "Lakeside Bistro", "Dining", -76.2, "Jane Doe"),
  t("013", "2026-09-21", "Jane Doe", "Transfer", -45, "John Doe"),
  t("012", "2026-09-20", "Corner Grocery", "Groceries", -103.77, "John Doe"),
  t("011", "2026-09-19", "Metro Transit", "Transport", -18, "John Doe"),
  t("010", "2026-09-18", "Greenleaf Market", "Groceries", -41.3, "Jane Doe"),
  t("009", "2026-09-17", "Maple Print Co.", "Freelance", 640, "Jane Doe"),
  t("008", "2026-09-15", "City Power", "Utilities", -91.08, "John Doe"),
  t("007", "2026-09-14", "Riverside Cinema", "Entertainment", -28, "Jane Doe"),
  t("006", "2026-09-12", "Northside Pharmacy", "Health", -14.2, "John Doe"),
  t("005", "2026-09-10", "Harbor Garage", "Transport", -120, "John Doe"),
  t("004", "2026-09-08", "Sunrise Bakery", "Dining", -12.35, "Jane Doe"),
  t("003", "2026-09-05", "Corner Grocery", "Groceries", -71.65, "John Doe"),
  t("002", "2026-09-01", "Brightline Studio", "Salary", 3850, "John Doe"),
  t("001", "2026-09-01", "Oak Street Apartments", "Rent", -1850, "John Doe"),
];

export function filterItems(items: readonly ActivityItem[], filter: ActivityFilter): ActivityItem[] {
  switch (filter) {
    case "all":
      return [...items];
    case "income":
      return items.filter((entry) => entry.amount > 0);
    case "expenses":
      return items.filter((entry) => entry.amount < 0);
    default:
      return items.filter((entry) => entry.category === filter);
  }
}

/** Newest first keeps the given order within a day; oldest is its exact reverse; amount puts the largest sum first. */
export function sortItems(items: readonly ActivityItem[], sort: ActivitySort): ActivityItem[] {
  // Array.prototype.sort is stable, so equal dates keep the order they were given in.
  const newest = [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (sort === "newest") return newest;
  if (sort === "oldest") return newest.reverse();
  return newest.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** The sum of the amounts, added in whole cents so that 0.1 + 0.2 is 0.3. */
export function netTotal(items: readonly ActivityItem[]): number {
  return items.reduce((total, entry) => total + Math.round(entry.amount * 100), 0) / 100;
}

const DRAFTS: readonly Pick<ActivityItem, "merchant" | "category" | "amount" | "who">[] = [
  { merchant: "Greenleaf Market", category: "Groceries", amount: -36.8, who: "Jane Doe" },
  { merchant: "Sunrise Bakery", category: "Dining", amount: -11.25, who: "John Doe" },
  { merchant: "Metro Transit", category: "Transport", amount: -4.5, who: "John Doe" },
  { merchant: "Jane Doe", category: "Transfer", amount: 60, who: "Jane Doe" },
  { merchant: "Lakeside Bistro", category: "Dining", amount: -48.9, who: "Jane Doe" },
  { merchant: "Maple Print Co.", category: "Freelance", amount: 215, who: "Jane Doe" },
];

/** The nth invented transaction that "Add transaction" creates, dated today. */
export function draftTransaction(n: number): ActivityItem {
  return { id: `n-${n}`, date: TODAY, ...DRAFTS[n % DRAFTS.length]! };
}

export interface ActivityState {
  /** Every transaction, in the order they were added; the view sorts and filters a copy. */
  items: readonly ActivityItem[];
  filter: ActivityFilter;
  sort: ActivitySort;
  /** How many transactions were added, which is the n of the next draft. */
  added: number;
}

export type ActivityAction =
  | { type: "add"; item: ActivityItem }
  | { type: "remove"; id: string }
  | { type: "restore"; item: ActivityItem; index: number }
  | { type: "filter"; filter: ActivityFilter }
  | { type: "sort"; sort: ActivitySort };

export const initialActivityState = (): ActivityState => ({ items: ACTIVITY, filter: "all", sort: "newest", added: 0 });

export function activityReducer(state: ActivityState, action: ActivityAction): ActivityState {
  switch (action.type) {
    case "add": {
      // A new transaction is always shown at the top: a filter that would hide it is cleared, and the order is newest first.
      const hidden = filterItems([action.item], state.filter).length === 0;
      return { items: [action.item, ...state.items], filter: hidden ? "all" : state.filter, sort: "newest", added: state.added + 1 };
    }
    case "remove": {
      if (!state.items.some((entry) => entry.id === action.id)) return state;
      return { ...state, items: state.items.filter((entry) => entry.id !== action.id) };
    }
    case "restore": {
      if (state.items.some((entry) => entry.id === action.item.id)) return state;
      const at = Math.min(Math.max(action.index, 0), state.items.length);
      return { ...state, items: [...state.items.slice(0, at), action.item, ...state.items.slice(at)] };
    }
    case "filter":
      return { ...state, filter: action.filter === state.filter ? "all" : action.filter };
    case "sort":
      return { ...state, sort: action.sort };
  }
}

/** What the list shows: the filter applied, then the sort. */
export const visibleItems = (state: Pick<ActivityState, "items" | "filter" | "sort">): ActivityItem[] =>
  sortItems(filterItems(state.items, state.filter), state.sort);
