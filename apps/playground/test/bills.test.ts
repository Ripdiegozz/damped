import { describe, expect, test } from "bun:test";
import { BILLS, dueText, parseAmount } from "../src/bills";

describe("dueText", () => {
  test("counts days ahead", () => {
    expect(dueText(3)).toEqual({ text: "Due in 3 days", overdue: false });
    expect(dueText(12)).toEqual({ text: "Due in 12 days", overdue: false });
  });

  test("uses plain words for today and tomorrow", () => {
    expect(dueText(0)).toEqual({ text: "Due today", overdue: false });
    expect(dueText(1)).toEqual({ text: "Due tomorrow", overdue: false });
  });

  test("flags bills that are late, with the right plural", () => {
    expect(dueText(-2)).toEqual({ text: "Overdue by 2 days", overdue: true });
    expect(dueText(-1)).toEqual({ text: "Overdue by 1 day", overdue: true });
  });

  test("rejects a fractional number of days", () => {
    expect(() => dueText(1.5)).toThrow(RangeError);
    expect(() => dueText(Number.NaN)).toThrow(RangeError);
  });
});

describe("parseAmount", () => {
  test("reads plain and formatted amounts", () => {
    expect(parseAmount("182.40")).toBe(182.4);
    expect(parseAmount("1850")).toBe(1850);
    expect(parseAmount("$1,850.00")).toBe(1850);
    expect(parseAmount("  59.99 ")).toBe(59.99);
    expect(parseAmount("7.5")).toBe(7.5);
  });

  test("rejects anything that is not a positive amount of dollars and cents", () => {
    for (const text of ["", "abc", "0", "0.00", "-5", "1.234", "12.", "1e3", "1,85.00", "$", "5 dollars"]) {
      expect(parseAmount(text), text).toBeUndefined();
    }
  });
});

describe("BILLS", () => {
  test("has the seven invented bills with unique ids", () => {
    expect(BILLS).toHaveLength(7);
    expect(new Set(BILLS.map((bill) => bill.id)).size).toBe(7);
    const names = BILLS.map((bill) => bill.name);
    for (const name of ["Harbor Insurance", "City Power", "FiberNet", "Blue Gym", "Metro Transit pass", "Rent", "Shared groceries with Jane Doe"]) {
      expect(names).toContain(name);
    }
  });

  test("pays the rent to Oak Street Apartments and shares groceries with Jane Doe", () => {
    expect(BILLS.find((bill) => bill.name === "Rent")?.payee).toBe("Oak Street Apartments");
    expect(BILLS.find((bill) => bill.name.startsWith("Shared groceries"))?.payee).toBe("Jane Doe");
  });

  test("varies: amounts, autopay and one overdue bill", () => {
    expect(new Set(BILLS.map((bill) => bill.amount)).size).toBeGreaterThanOrEqual(6);
    expect(BILLS.some((bill) => bill.autopay)).toBe(true);
    expect(BILLS.some((bill) => !bill.autopay)).toBe(true);
    expect(BILLS.filter((bill) => bill.dueInDays < 0)).toHaveLength(1);
    for (const bill of BILLS) {
      expect(bill.amount).toBeGreaterThan(0);
      expect(Math.round(bill.amount * 100)).toBeCloseTo(bill.amount * 100, 6);
    }
  });
});
