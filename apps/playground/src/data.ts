// All data in Northbook is invented. John Doe owns the account; Jane Doe is his partner and shares it.

export interface OverviewData {
  balance: number;
  income: number;
  spent: number;
  saved: number;
  goal: number;
}

export type ShuffledField = "balance" | "income" | "spent" | "saved";

export interface Transaction {
  id: string;
  merchant: string;
  category: string;
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  /** Positive for income and transfers in, negative for spending (USD). */
  amount: number;
}

export const INITIAL_OVERVIEW: OverviewData = {
  balance: 24860.42,
  income: 5830,
  spent: 2364.18,
  saved: 6400,
  goal: 10000,
};

/** Realistic ranges for "Shuffle data". Saved stays below the goal, so the progress bar never pins at full. */
export const OVERVIEW_BOUNDS: Record<ShuffledField, { min: number; max: number }> = {
  balance: { min: 18000, max: 32000 },
  income: { min: 3500, max: 7500 },
  spent: { min: 1200, max: 4800 },
  saved: { min: 1500, max: 9500 },
};

/** A shuffled figure moves by at least this share of its range, so every tile visibly retargets. */
const MIN_MOVE = 0.15;

export const RECENT_ACTIVITY: readonly Transaction[] = [
  { id: "t-1004", merchant: "Corner Grocery", category: "Groceries", date: "2026-10-04", amount: -62.14 },
  { id: "t-1003", merchant: "Sunrise Bakery", category: "Dining", date: "2026-10-03", amount: -14.85 },
  { id: "t-1002", merchant: "Jane Doe", category: "Transfer", date: "2026-10-02", amount: 120 },
  { id: "t-1001", merchant: "Brightline Studio", category: "Salary", date: "2026-10-01", amount: 3850 },
  { id: "t-0930", merchant: "City Power", category: "Utilities", date: "2026-09-30", amount: -94.3 },
];

/** Share of the goal that is saved, within 0..1. */
export function savingsProgress({ saved, goal }: Pick<OverviewData, "saved" | "goal">): number {
  if (!(goal > 0)) return 0;
  return Math.min(1, Math.max(0, saved / goal));
}

const toCents = (value: number): number => Math.round(value * 100) / 100;

// A random value in [min, max] that is at least MIN_MOVE of the range away from `previous`: it is drawn from
// the larger side of the range, which always has room for that distance.
function pick(random: () => number, { min, max }: { min: number; max: number }, previous: number): number {
  const gap = (max - min) * MIN_MOVE;
  const value = min + random() * (max - min);
  if (Math.abs(value - previous) >= gap) return toCents(value);
  const below = previous - min >= max - previous;
  return toCents(below ? min + random() * (previous - gap - min) : previous + gap + random() * (max - previous - gap));
}

/** New figures for the Overview, each clearly different from the current one. The input is left untouched. */
export function shuffleOverview(data: OverviewData, random: () => number = Math.random): OverviewData {
  return {
    balance: pick(random, OVERVIEW_BOUNDS.balance, data.balance),
    income: pick(random, OVERVIEW_BOUNDS.income, data.income),
    spent: pick(random, OVERVIEW_BOUNDS.spent, data.spent),
    saved: pick(random, OVERVIEW_BOUNDS.saved, data.saved),
    goal: data.goal,
  };
}
