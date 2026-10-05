import { describe, expect, test } from "bun:test";
import { formatCurrency, formatPercent, formatShortDate, formatSignedCurrency } from "../src/format";

describe("formatCurrency", () => {
  test("groups thousands and shows cents by default", () => {
    expect(formatCurrency(24860.42)).toBe("$24,860.42");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(1234567.8)).toBe("$1,234,567.80");
  });

  test("rounds to the requested fraction digits", () => {
    expect(formatCurrency(9999.996)).toBe("$10,000.00");
    expect(formatCurrency(10000, 0)).toBe("$10,000");
    expect(formatCurrency(6399.6, 0)).toBe("$6,400");
  });

  test("puts the minus sign before the currency symbol", () => {
    expect(formatCurrency(-62.14)).toBe("-$62.14");
  });

  test("keeps in-between spring values readable", () => {
    expect(formatCurrency(12345.678912)).toBe("$12,345.68");
  });
});

describe("formatSignedCurrency", () => {
  test("marks income and spending explicitly", () => {
    expect(formatSignedCurrency(3850)).toBe("+$3,850.00");
    expect(formatSignedCurrency(-94.3)).toBe("-$94.30");
  });

  test("leaves zero unsigned", () => {
    expect(formatSignedCurrency(0)).toBe("$0.00");
  });
});

describe("formatPercent", () => {
  test("shows a ratio as a whole percentage", () => {
    expect(formatPercent(0.64)).toBe("64%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0.3333)).toBe("33%");
  });
});

describe("formatShortDate", () => {
  test("shows month and day for an ISO date", () => {
    expect(formatShortDate("2026-10-03")).toBe("Oct 3");
    expect(formatShortDate("2026-01-31")).toBe("Jan 31");
  });

  test("does not shift with the local time zone", () => {
    const zone = process.env.TZ;
    try {
      for (const tz of ["Pacific/Honolulu", "Asia/Tokyo", "UTC"]) {
        process.env.TZ = tz;
        expect(formatShortDate("2026-10-01")).toBe("Oct 1");
      }
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });

  test("rejects text that is not a calendar date", () => {
    expect(() => formatShortDate("yesterday")).toThrow(RangeError);
    expect(() => formatShortDate("2026-13-40")).toThrow(RangeError);
  });
});
