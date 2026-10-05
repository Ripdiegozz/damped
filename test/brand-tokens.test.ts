import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, parseTokens } from "../brand/tokens";

const css = readFileSync(join(import.meta.dir, "../brand/tokens.css"), "utf8");
const tokens = parseTokens(css);

function token(name: string): string {
  const value = tokens[name];
  if (value === undefined) throw new Error(`brand/tokens.css has no ${name}`);
  return value;
}

test("contrast follows the WCAG 2.x definition", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  expect(contrast("#fff", "#000")).toBeCloseTo(21, 5);
});

test("parseTokens reads declarations and ignores comments and var() aliases", () => {
  expect(parseTokens("/* x: #111111; */ :root { --a: #FFAA00; --b: var(--a); --c: 4px; }")).toEqual({ "--a": "#ffaa00", "--c": "4px" });
});

// Every pair a text colour is set on a surface must clear WCAG AA for normal text.
const pairs: [string, string][] = [
  ["--damped-dark-ink", "--damped-dark-paper"],
  ["--damped-dark-ink-muted", "--damped-dark-paper"],
  ["--damped-accent-text-dark", "--damped-dark-paper"],
  ["--damped-light-ink", "--damped-light-paper"],
  ["--damped-light-ink", "--damped-light-surface"],
  ["--damped-light-ink-muted", "--damped-light-paper"],
  ["--damped-light-ink-muted", "--damped-light-surface"],
  ["--damped-accent-text-light", "--damped-light-paper"],
  ["--damped-accent-text-light", "--damped-light-surface"],
];

for (const [fg, bg] of pairs) {
  test(`${fg} on ${bg} reaches 4.5:1`, () => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
}

test("the accent stays the signal colour on the dark surface", () => {
  expect(token("--damped-accent")).toBe("#ff5f1f");
  expect(contrast(token("--damped-accent"), token("--damped-dark-paper"))).toBeGreaterThanOrEqual(4.5);
});
