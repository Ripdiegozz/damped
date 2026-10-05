import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { builtOutputMode } from "./built-output";

// Expressive Code draws a code block as one frame: the header (terminal dots or a file-name tab) and the `pre`
// share a border, and only the outer corners are rounded. Rounding `pre` or `.frame` from our own CSS detaches
// the header from the body and doubles the borders, so the radius has to come from Expressive Code itself.

const docsRoot = resolve(import.meta.dir, "..");
const read = (path: string): string => readFileSync(join(docsRoot, path), "utf8");

interface CssRule {
  selector: string;
  body: string;
}

/** The innermost rules of a stylesheet. Rules inside at-rules come out with their own selector. */
function rulesOf(css: string): CssRule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector!.trim(),
    body: body!,
  }));
}

/** True when one selector of the list targets the element itself, not something inside or beside it. */
function targets(selectorList: string, subject: RegExp): boolean {
  return selectorList
    .split(",")
    .map((selector) => selector.replace(/:not\([^)]*\)/g, "").trim())
    .some((selector) => subject.test(selector.split(/\s+|>|\+|~/).filter(Boolean).at(-1) ?? ""));
}

const stylesheets = readdirSync(join(docsRoot, "src/styles"))
  .filter((name) => name.endsWith(".css"))
  .map((name) => ({ name, rules: rulesOf(read(join("src/styles", name))) }));

describe("code frames and asides", () => {
  test("rulesOf and targets see through comments, selector lists and :not()", () => {
    const rules = rulesOf("/* pre { border-radius: 1px } */ a, .x pre { border-radius: 2px } :not(pre) > code { color: red }");
    expect(rules).toHaveLength(2);
    expect(targets(rules[0]!.selector, /^pre$/)).toBe(true);
    expect(targets(rules[1]!.selector, /^pre$/)).toBe(false);
    expect(targets(".expressive-code .frame", /^\.frame$/)).toBe(true);
  });

  test("no stylesheet rounds a code block's pre or frame", () => {
    const offenders = stylesheets.flatMap(({ name, rules }) =>
      rules
        .filter((rule) => /border(-[a-z-]+)?-radius\s*:/.test(rule.body))
        .filter((rule) => targets(rule.selector, /^(pre|\.frame)$/))
        .map((rule) => `${name}: ${rule.selector}`),
    );
    expect(offenders).toEqual([]);
  });

  test("no stylesheet rounds an aside, whose thick start border would curve", () => {
    const offenders = stylesheets.flatMap(({ name, rules }) =>
      rules
        .filter((rule) => /border(-[a-z-]+)?-radius\s*:/.test(rule.body))
        .filter((rule) => targets(rule.selector, /^\.starlight-aside$/))
        .map((rule) => `${name}: ${rule.selector}`),
    );
    expect(offenders).toEqual([]);
  });

  test("the frame radius is configured through Expressive Code", () => {
    expect(read("astro.config.mjs")).toMatch(/expressiveCode:\s*\{[\s\S]*styleOverrides:\s*\{[\s\S]*borderRadius:/);
  });

  const astroDir = join(docsRoot, "dist/_astro");
  const mode = builtOutputMode(existsSync(astroDir));
  test.skipIf(mode === "skip")("the built CSS carries the configured frame radius", () => {
    if (mode === "fail") throw new Error("apps/docs/dist is missing; run `bun run docs:build` before the tests in CI");
    const radius = read("astro.config.mjs").match(/borderRadius:\s*"([^"]+)"/)?.[1];
    expect(radius).toBeDefined();
    const css = readdirSync(astroDir)
      .filter((name) => name.endsWith(".css"))
      .map((name) => readFileSync(join(astroDir, name), "utf8"))
      .join("\n");
    expect(css).toContain(`--ec-brdRad:${radius}`);
  });
});
