import { describe, expect, test } from "bun:test";
import { columnCount, nextIndex } from "../src/grid-nav";

describe("columnCount", () => {
  test("counts the items in the first row", () => {
    expect(columnCount([10, 10, 10, 200, 200, 200, 390])).toBe(3);
  });

  test("tolerates sub-pixel differences in a row", () => {
    expect(columnCount([10, 10.4, 9.8, 200])).toBe(3);
  });

  test("is one column when every item has its own row, and handles a single item", () => {
    expect(columnCount([0, 100, 200])).toBe(1);
    expect(columnCount([5])).toBe(1);
  });

  test("is 1 for an empty grid", () => {
    expect(columnCount([])).toBe(1);
  });
});

describe("nextIndex", () => {
  // Seven items in three columns:  0 1 2 / 3 4 5 / 6
  test("moves along a row and stops at the ends", () => {
    expect(nextIndex("ArrowRight", 1, 3, 7)).toBe(2);
    expect(nextIndex("ArrowRight", 6, 3, 7)).toBe(6);
    expect(nextIndex("ArrowLeft", 1, 3, 7)).toBe(0);
    expect(nextIndex("ArrowLeft", 0, 3, 7)).toBe(0);
  });

  test("moves by a whole row up and down", () => {
    expect(nextIndex("ArrowDown", 1, 3, 7)).toBe(4);
    expect(nextIndex("ArrowUp", 4, 3, 7)).toBe(1);
    expect(nextIndex("ArrowUp", 1, 3, 7)).toBe(1);
  });

  test("stays put when no item sits below", () => {
    expect(nextIndex("ArrowDown", 4, 3, 7)).toBe(4);
    expect(nextIndex("ArrowDown", 5, 3, 7)).toBe(5);
    expect(nextIndex("ArrowDown", 6, 3, 7)).toBe(6);
  });

  test("jumps to the first and last item", () => {
    expect(nextIndex("Home", 4, 3, 7)).toBe(0);
    expect(nextIndex("End", 1, 3, 7)).toBe(6);
  });

  test("ignores other keys", () => {
    expect(nextIndex("Enter", 1, 3, 7)).toBeUndefined();
    expect(nextIndex("a", 1, 3, 7)).toBeUndefined();
  });
});
