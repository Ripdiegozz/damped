import { describe, expect, test } from "bun:test";
import { parseDebug } from "../src/debug";

describe("parseDebug", () => {
  test("is inert without a query", () => {
    expect(parseDebug("")).toEqual({ renders: false, toastMs: undefined, slow: 1 });
  });

  test("reads the test hooks", () => {
    expect(parseDebug("?renders&toastMs=500&slow=4")).toEqual({ renders: true, toastMs: 500, slow: 4 });
  });

  test("ignores values that make no sense", () => {
    for (const search of ["?toastMs=abc", "?toastMs=-5", "?toastMs=0", "?toastMs=1.5", "?toastMs=999999"]) {
      expect(parseDebug(search).toastMs, search).toBeUndefined();
    }
    for (const search of ["?slow=abc", "?slow=0.5", "?slow=0", "?slow=100"]) {
      expect(parseDebug(search).slow, search).toBe(1);
    }
  });
});
