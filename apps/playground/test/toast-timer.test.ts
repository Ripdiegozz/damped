import { describe, expect, test } from "bun:test";
import { MIN_RESUME_MS, remainingAfterPause } from "../src/toast-timer";

describe("remainingAfterPause", () => {
  test("subtracts the time that has run", () => {
    expect(remainingAfterPause({ remaining: 4000, elapsed: 1000, duration: 4000 })).toBe(3000);
  });

  test("never leaves less than a second, so the toast can still be read after a pause", () => {
    expect(remainingAfterPause({ remaining: 4000, elapsed: 3800, duration: 4000 })).toBe(MIN_RESUME_MS);
    expect(remainingAfterPause({ remaining: 500, elapsed: 400, duration: 4000 })).toBe(MIN_RESUME_MS);
  });

  test("keeps the floor even when more time than was left has passed", () => {
    expect(remainingAfterPause({ remaining: 200, elapsed: 5000, duration: 4000 })).toBe(MIN_RESUME_MS);
  });

  test("a toast shorter than the floor resumes with its whole duration at most", () => {
    expect(remainingAfterPause({ remaining: 500, elapsed: 400, duration: 500 })).toBe(500);
    expect(remainingAfterPause({ remaining: 500, elapsed: 0, duration: 500 })).toBe(500);
  });

  test("a pause right after resuming loses nothing", () => {
    expect(remainingAfterPause({ remaining: 2500, elapsed: 0, duration: 4000 })).toBe(2500);
  });
});
