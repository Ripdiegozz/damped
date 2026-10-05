import { describe, expect, test } from "bun:test";
import { chooseFps, gifFilter, parseFrameRate, trimWindow } from "../scripts/gif-encode";

describe("parseFrameRate", () => {
  test("reads the fraction ffprobe prints", () => {
    expect(parseFrameRate("25/1\n")).toBe(25);
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97, 2);
  });

  test("reads a plain number", () => {
    expect(parseFrameRate("24")).toBe(24);
  });

  test("rejects anything that is not a positive rate", () => {
    for (const text of ["", "0/0", "abc", "-5/1", "25/0"]) expect(() => parseFrameRate(text), text).toThrow(/frame rate/);
  });
});

describe("chooseFps", () => {
  test("never goes above what the recording has, since extra frames would only repeat", () => {
    expect(chooseFps(25, 30)).toBe(25);
    expect(chooseFps(60, 30)).toBe(30);
  });

  test("rounds a fractional rate", () => {
    expect(chooseFps(29.97, 30)).toBe(30);
  });
});

describe("trimWindow", () => {
  test("starts a little before the first action and ends a little after the last", () => {
    const window = trimWindow({ created: 1000, started: 3000, ended: 12000 }, 0.3, 0.4);
    expect(window.start).toBeCloseTo(1.7, 6);
    expect(window.length).toBeCloseTo(9.7, 6);
  });

  test("never starts before the recording does", () => {
    expect(trimWindow({ created: 1000, started: 1100, ended: 2000 }, 0.5, 0).start).toBe(0);
  });
});

describe("gifFilter", () => {
  test("sets the rate and scales to the width with Lanczos, keeping the aspect ratio", () => {
    expect(gifFilter(25, 800)).toBe("fps=25,scale=800:-1:flags=lanczos");
  });
});
