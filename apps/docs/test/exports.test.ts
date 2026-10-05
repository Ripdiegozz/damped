import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportedNames, markdownHeadings, section } from "../scripts/exports";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "damped-exports-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "src/index.ts"),
    [
      'export * from "./all";',
      'export { one, two as renamed } from "./named";',
      'export type { Shape, Other as Aliased } from "./types";',
      'export { hook, type HookHandle } from "./hook";',
      'export * as helpers from "./helpers";',
      "export function local(): void {}",
      "export const value = 1;",
      "export interface LocalShape { a: number }",
      "export type LocalAlias = string;",
      "export class Widget {}",
      "export enum Mode { A }",
      "const hidden = 1;",
      "function internal() {}",
      "export { hidden as shown };",
      "",
    ].join("\n"),
  );
  await writeFile(join(root, "src/all.ts"), 'export function fromAll(): void {}\nexport type AllType = number;\nexport * from "./deep";\nconst notExported = 1;\n');
  await writeFile(join(root, "src/deep.ts"), "export const deep = 1;\n");
  await writeFile(join(root, "src/named.ts"), "export const one = 1;\nexport const two = 2;\nexport const three = 3;\n");
  await writeFile(join(root, "src/types.ts"), "export interface Shape {}\nexport interface Other {}\nexport interface Unused {}\n");
  await writeFile(join(root, "src/hook.ts"), "export function hook() {}\nexport interface HookHandle {}\n");
  await writeFile(join(root, "src/helpers.ts"), "export const help = 1;\n");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("exportedNames", () => {
  test("follows export-star, named, type-only, renamed and namespace re-exports and local declarations", async () => {
    const names = await exportedNames(join(root, "src/index.ts"));
    expect([...names.runtime].sort()).toEqual(
      ["Mode", "Widget", "deep", "fromAll", "helpers", "hook", "local", "one", "renamed", "shown", "value"].sort(),
    );
    expect([...names.types].sort()).toEqual(["AllType", "Aliased", "HookHandle", "LocalAlias", "LocalShape", "Shape"].sort());
  });

  test("does not report names that are declared but not exported, or exported by a module only named in part", async () => {
    const names = await exportedNames(join(root, "src/index.ts"));
    for (const hidden of ["hidden", "internal", "notExported", "three", "Unused", "Other", "two", "help"]) {
      expect(names.runtime.has(hidden) || names.types.has(hidden)).toBe(false);
    }
  });

  test("reads the real package entries", async () => {
    const core = await exportedNames(join(import.meta.dir, "../../../packages/core/src/index.ts"));
    expect(core.runtime.has("createSpring")).toBe(true); // through `export *`
    expect(core.runtime.has("createSpringValue")).toBe(true); // through a named re-export
    expect(core.types.has("Scheduler")).toBe(true);
    expect(core.runtime.has("seedSpringValue")).toBe(false); // internal on purpose
  });
});

describe("markdownHeadings", () => {
  test("lists headings with level, text without code marks, line and github-style slug", () => {
    const source = ["---", "title: T", "---", "", "## `createSpring`", "text", "### Options & more", "", "```ts", "# not a heading", "```", "#### withDamped"].join("\n");
    expect(markdownHeadings(source)).toEqual([
      { level: 2, text: "createSpring", slug: "createspring", line: 5 },
      { level: 3, text: "Options & more", slug: "options--more", line: 7 },
      { level: 4, text: "withDamped", slug: "withdamped", line: 12 },
    ]);
  });
});

describe("markdownHeadings slugs", () => {
  test("repeated slugs get the numeric suffix github-slugger gives them, in document order", () => {
    const slugs = markdownHeadings(["### springParams", "### SpringParams", "### other", "### SPRINGPARAMS"].join("\n")).map((heading) => heading.slug);
    expect(slugs).toEqual(["springparams", "springparams-1", "other", "springparams-2"]);
  });
});

describe("section", () => {
  test("returns the text from a heading to the next heading of the same or a higher level", () => {
    const source = ["## Types", "### A", "a body", "#### deeper", "deeper body", "### B", "b body", "## Next"].join("\n");
    const headings = markdownHeadings(source);
    const a = headings.find((heading) => heading.text === "A");
    expect(a).toBeDefined();
    expect(section(source, headings, a!)).toBe("### A\na body\n#### deeper\ndeeper body");
  });
});
