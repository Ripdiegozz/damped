import { describe, expect, test } from "bun:test";
import { INITIAL_OVERVIEW, OVERVIEW_BOUNDS, RECENT_ACTIVITY, savingsProgress, shuffleOverview, type OverviewData } from "../src/data";

/** A small deterministic generator, so a failing shuffle can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIELDS = ["balance", "income", "spent", "saved"] as const;

describe("savingsProgress", () => {
  test("is the saved share of the goal", () => {
    expect(savingsProgress({ ...INITIAL_OVERVIEW, saved: 6400, goal: 10000 })).toBe(0.64);
  });

  test("stays within 0..1", () => {
    expect(savingsProgress({ ...INITIAL_OVERVIEW, saved: 12000, goal: 10000 })).toBe(1);
    expect(savingsProgress({ ...INITIAL_OVERVIEW, saved: -5, goal: 10000 })).toBe(0);
    expect(savingsProgress({ ...INITIAL_OVERVIEW, saved: 5, goal: 0 })).toBe(0);
  });
});

describe("shuffleOverview", () => {
  test("changes every figure, so each tile visibly retargets", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const next = shuffleOverview(INITIAL_OVERVIEW, seeded(seed));
      for (const field of FIELDS) {
        const { min, max } = OVERVIEW_BOUNDS[field];
        expect(Math.abs(next[field] - INITIAL_OVERVIEW[field])).toBeGreaterThanOrEqual((max - min) * 0.15 - 0.01);
      }
    }
  });

  test("keeps every figure inside its realistic range, however many times it is shuffled", () => {
    const random = seeded(7);
    let data: OverviewData = INITIAL_OVERVIEW;
    for (let round = 0; round < 500; round++) {
      data = shuffleOverview(data, random);
      for (const field of FIELDS) {
        expect(data[field]).toBeGreaterThanOrEqual(OVERVIEW_BOUNDS[field].min);
        expect(data[field]).toBeLessThanOrEqual(OVERVIEW_BOUNDS[field].max);
      }
      expect(savingsProgress(data)).toBeLessThanOrEqual(1);
    }
  });

  test("rounds to whole cents and keeps the goal", () => {
    const next = shuffleOverview(INITIAL_OVERVIEW, seeded(3));
    for (const field of FIELDS) expect(Math.round(next[field] * 100)).toBeCloseTo(next[field] * 100, 6);
    expect(next.goal).toBe(INITIAL_OVERVIEW.goal);
  });

  test("does not mutate its input and is deterministic for one generator", () => {
    const before = { ...INITIAL_OVERVIEW };
    const first = shuffleOverview(INITIAL_OVERVIEW, seeded(11));
    expect(INITIAL_OVERVIEW).toEqual(before);
    expect(shuffleOverview(INITIAL_OVERVIEW, seeded(11))).toEqual(first);
  });
});

describe("initial data", () => {
  test("starts inside the shuffle ranges", () => {
    for (const field of FIELDS) {
      expect(INITIAL_OVERVIEW[field]).toBeGreaterThanOrEqual(OVERVIEW_BOUNDS[field].min);
      expect(INITIAL_OVERVIEW[field]).toBeLessThanOrEqual(OVERVIEW_BOUNDS[field].max);
    }
  });

  test("has five recent transactions, newest first, with both income and spending", () => {
    expect(RECENT_ACTIVITY).toHaveLength(5);
    const dates = RECENT_ACTIVITY.map((transaction) => transaction.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(RECENT_ACTIVITY.some((transaction) => transaction.amount > 0)).toBe(true);
    expect(RECENT_ACTIVITY.some((transaction) => transaction.amount < 0)).toBe(true);
    expect(new Set(RECENT_ACTIVITY.map((transaction) => transaction.id)).size).toBe(5);
  });
});
