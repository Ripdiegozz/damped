import { describe, expect, test } from "bun:test";
import { concatList, gifFilter, trimWindow } from "../scripts/gif-encode";

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

describe("concatList", () => {
  test("lists each frame with how long it stays, and repeats the last file as ffmpeg's concat demuxer needs", () => {
    const list = concatList(
      [
        { file: "a.png", time: 10 },
        { file: "b.png", time: 10.5 },
      ],
      11.25,
    );
    expect(list.split("\n")).toEqual([
      "ffconcat version 1.0",
      "file 'a.png'",
      "duration 0.500000",
      "file 'b.png'",
      "duration 0.750000",
      "file 'b.png'",
      "",
    ]);
  });

  test("never gives a frame a zero or negative duration", () => {
    const list = concatList(
      [
        { file: "a.png", time: 1 },
        { file: "b.png", time: 1 },
      ],
      1,
    );
    for (const match of list.matchAll(/duration (\S+)/g)) expect(Number(match[1])).toBeGreaterThan(0);
  });

  test("quotes file names that contain a quote", () => {
    expect(concatList([{ file: "it's.png", time: 0 }], 1)).toContain("file 'it'\\''s.png'");
  });

  test("needs at least one frame", () => {
    expect(() => concatList([], 1)).toThrow(/no frames/);
  });
});
