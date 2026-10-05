import { describe, expect, test } from "bun:test";
import {
  ACTIVITY,
  CATEGORY_FILTERS,
  activityReducer,
  draftTransaction,
  filterItems,
  initialActivityState,
  netTotal,
  sortItems,
  visibleItems,
  type ActivityItem,
} from "../src/activity";

const item = (id: string, date: string, amount: number, category = "Groceries"): ActivityItem => ({
  id,
  merchant: `Merchant ${id}`,
  category,
  date,
  amount,
  who: "John Doe",
});

describe("ACTIVITY", () => {
  test("has 20 to 30 invented transactions with unique ids", () => {
    expect(ACTIVITY.length).toBeGreaterThanOrEqual(20);
    expect(ACTIVITY.length).toBeLessThanOrEqual(30);
    expect(new Set(ACTIVITY.map((entry) => entry.id)).size).toBe(ACTIVITY.length);
  });

  test("covers September and October, both signs and both people", () => {
    for (const entry of ACTIVITY) {
      expect(entry.date >= "2026-09-01" && entry.date <= "2026-10-04", entry.date).toBe(true);
      expect(Math.round(entry.amount * 100)).toBeCloseTo(entry.amount * 100, 6);
      expect(entry.amount).not.toBe(0);
    }
    expect(ACTIVITY.some((entry) => entry.amount > 0)).toBe(true);
    expect(ACTIVITY.some((entry) => entry.amount < 0)).toBe(true);
    expect(new Set(ACTIVITY.map((entry) => entry.who))).toEqual(new Set(["John Doe", "Jane Doe"]));
    expect(ACTIVITY.some((entry) => entry.date.startsWith("2026-09"))).toBe(true);
    expect(ACTIVITY.some((entry) => entry.date.startsWith("2026-10"))).toBe(true);
  });

  test("starts newest first, and every category chip has transactions to show", () => {
    const dates = ACTIVITY.map((entry) => entry.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(CATEGORY_FILTERS.length).toBeGreaterThanOrEqual(3);
    expect(CATEGORY_FILTERS.length).toBeLessThanOrEqual(4);
    for (const category of CATEGORY_FILTERS) {
      expect(filterItems(ACTIVITY, category).length, category).toBeGreaterThan(1);
    }
  });
});

describe("filterItems", () => {
  const items = [item("a", "2026-10-01", 100, "Salary"), item("b", "2026-10-02", -5, "Dining"), item("c", "2026-10-03", -9, "Groceries")];

  test("all keeps everything", () => {
    expect(filterItems(items, "all")).toEqual(items);
  });

  test("income keeps positive amounts and expenses keep negative ones", () => {
    expect(filterItems(items, "income").map((entry) => entry.id)).toEqual(["a"]);
    expect(filterItems(items, "expenses").map((entry) => entry.id)).toEqual(["b", "c"]);
  });

  test("a category keeps that category only", () => {
    expect(filterItems(items, "Dining").map((entry) => entry.id)).toEqual(["b"]);
    expect(filterItems(items, "Transport")).toEqual([]);
  });
});

describe("sortItems", () => {
  const items = [
    item("a", "2026-10-01", -20),
    item("b", "2026-10-03", 5),
    item("c", "2026-10-03", -300),
    item("d", "2026-09-30", 40),
  ];

  test("newest puts later dates first and keeps the given order within a day", () => {
    expect(sortItems(items, "newest").map((entry) => entry.id)).toEqual(["b", "c", "a", "d"]);
  });

  test("oldest is the exact reverse of newest", () => {
    expect(sortItems(items, "oldest").map((entry) => entry.id)).toEqual(["d", "a", "c", "b"]);
  });

  test("amount puts the largest sum first, whatever its sign", () => {
    expect(sortItems(items, "amount").map((entry) => entry.id)).toEqual(["c", "d", "a", "b"]);
  });

  test("does not change its input", () => {
    const copy = [...items];
    sortItems(items, "amount");
    expect(items).toEqual(copy);
  });
});

describe("netTotal", () => {
  test("adds income and expenses without floating point drift", () => {
    expect(netTotal([item("a", "2026-10-01", 0.1), item("b", "2026-10-01", 0.2)])).toBe(0.3);
    expect(netTotal([item("a", "2026-10-01", 3850), item("b", "2026-10-01", -1850), item("c", "2026-10-01", -62.14)])).toBe(1937.86);
  });

  test("is zero for nothing", () => {
    expect(netTotal([])).toBe(0);
  });
});

describe("draftTransaction", () => {
  test("is dated today with a unique id and a sum", () => {
    const drafts = Array.from({ length: 12 }, (_, index) => draftTransaction(index));
    expect(new Set(drafts.map((draft) => draft.id)).size).toBe(12);
    for (const draft of drafts) {
      expect(draft.date).toBe("2026-10-05");
      expect(draft.amount).not.toBe(0);
      expect(draft.merchant.length).toBeGreaterThan(0);
    }
    expect(new Set(drafts.map((draft) => draft.merchant)).size).toBeGreaterThan(3);
  });

  test("never collides with the seeded transactions", () => {
    const seeded = new Set(ACTIVITY.map((entry) => entry.id));
    for (let index = 0; index < 50; index++) expect(seeded.has(draftTransaction(index).id)).toBe(false);
  });
});

describe("activityReducer", () => {
  const start = initialActivityState();

  test("starts with every transaction, no filter and newest first", () => {
    expect(start.items).toEqual(ACTIVITY);
    expect(start.filter).toBe("all");
    expect(start.sort).toBe("newest");
    expect(visibleItems(start)).toEqual([...ACTIVITY]);
  });

  test("add puts the new transaction first", () => {
    const draft = draftTransaction(0);
    const next = activityReducer(start, { type: "add", item: draft });
    expect(next.items[0]).toEqual(draft);
    expect(next.items).toHaveLength(ACTIVITY.length + 1);
    expect(next.added).toBe(1);
    expect(start.items).toHaveLength(ACTIVITY.length);
  });

  test("add shows the new transaction: it clears a filter that would hide it and sorts newest first", () => {
    const draft = { ...draftTransaction(0), category: "Dining", amount: -11.25 };
    const hidden = activityReducer({ ...start, filter: "Groceries", sort: "oldest" }, { type: "add", item: draft });
    expect(hidden.filter).toBe("all");
    expect(hidden.sort).toBe("newest");
    expect(visibleItems(hidden)[0]).toEqual(draft);

    const kept = activityReducer({ ...start, filter: "Dining" }, { type: "add", item: draft });
    expect(kept.filter).toBe("Dining");
  });

  test("remove drops a transaction, and an unknown id changes nothing", () => {
    const next = activityReducer(start, { type: "remove", id: ACTIVITY[2]!.id });
    expect(next.items.map((entry) => entry.id)).not.toContain(ACTIVITY[2]!.id);
    expect(next.items).toHaveLength(ACTIVITY.length - 1);
    expect(activityReducer(start, { type: "remove", id: "missing" })).toBe(start);
  });

  test("restore puts a transaction back where it was, clamped to the list", () => {
    const removed = ACTIVITY[2]!;
    const gone = activityReducer(start, { type: "remove", id: removed.id });
    expect(activityReducer(gone, { type: "restore", item: removed, index: 2 }).items).toEqual(ACTIVITY);
    expect(activityReducer(gone, { type: "restore", item: removed, index: 999 }).items.at(-1)).toEqual(removed);
    expect(activityReducer(gone, { type: "restore", item: removed, index: -4 }).items[0]).toEqual(removed);
  });

  test("restore does not duplicate a transaction that is already there", () => {
    expect(activityReducer(start, { type: "restore", item: ACTIVITY[0]!, index: 0 })).toBe(start);
  });

  test("choosing the active chip again goes back to all", () => {
    const income = activityReducer(start, { type: "filter", filter: "income" });
    expect(income.filter).toBe("income");
    expect(activityReducer(income, { type: "filter", filter: "income" }).filter).toBe("all");
    expect(activityReducer(income, { type: "filter", filter: "all" }).filter).toBe("all");
    expect(activityReducer(income, { type: "filter", filter: "Dining" }).filter).toBe("Dining");
  });

  test("sort sets the order", () => {
    expect(activityReducer(start, { type: "sort", sort: "amount" }).sort).toBe("amount");
  });

  test("visibleItems filters and then sorts", () => {
    const state = activityReducer(activityReducer(start, { type: "filter", filter: "expenses" }), { type: "sort", sort: "amount" });
    const shown = visibleItems(state);
    expect(shown.every((entry) => entry.amount < 0)).toBe(true);
    const sizes = shown.map((entry) => Math.abs(entry.amount));
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });
});
