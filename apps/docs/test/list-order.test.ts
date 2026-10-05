import { describe, expect, test } from "bun:test";
import { MERCHANTS, shuffled, sortedByAmount, sortedByName } from "../src/components/demos/list-order";

// A deterministic generator, so the shuffle is testable.
function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id);

describe("MERCHANTS", () => {
  test("has unique ids and invented merchants only", () => {
    expect(new Set(ids(MERCHANTS)).size).toBe(MERCHANTS.length);
    expect(MERCHANTS.length).toBeGreaterThanOrEqual(5);
  });
});

describe("shuffled", () => {
  test("is a permutation and does not mutate its input", () => {
    const before = ids(MERCHANTS);
    const result = shuffled(MERCHANTS, sequence([0.9, 0.1, 0.5, 0.3]));
    expect([...ids(result)].sort()).toEqual([...before].sort());
    expect(ids(MERCHANTS)).toEqual(before);
  });

  test("always changes the order, even when the random draw would keep it", () => {
    // A generator that always returns just below 1 picks the last remaining index, which is the identity permutation.
    const result = shuffled(MERCHANTS, () => 0.999999);
    expect(ids(result)).not.toEqual(ids(MERCHANTS));
  });

  test("a single item has nothing to shuffle", () => {
    const one = [MERCHANTS[0]!];
    expect(shuffled(one)).toEqual(one);
  });
});

describe("sorting", () => {
  test("by name is alphabetical and stable for equal names", () => {
    const items = [
      { id: "b", name: "Blue Gym", amount: 1 },
      { id: "a2", name: "alpha", amount: 2 },
      { id: "a1", name: "Alpha", amount: 3 },
    ];
    expect(ids(sortedByName(items))).toEqual(["a2", "a1", "b"]);
  });

  test("by amount puts the largest first and does not mutate", () => {
    const before = ids(MERCHANTS);
    const sorted = sortedByAmount(MERCHANTS);
    const amounts = sorted.map((item) => item.amount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(ids(MERCHANTS)).toEqual(before);
  });
});
