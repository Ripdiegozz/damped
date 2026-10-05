import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractBlocks, mapDiagnostics, moduleSource, readReadme, type CodeBlock } from "../scripts/readme-examples";

const doc = [
  "# Title", // 1
  "", // 2
  "```sh", // 3
  "bun add thing", // 4
  "```", // 5
  "", // 6
  "```ts", // 7
  'import { a } from "x";', // 8
  "a();", // 9
  "```", // 10
  "", // 11
  "```tsx", // 12
  "const view = <div />;", // 13
  "```", // 14
  "", // 15
  "```ts no-check", // 16
  "this is a fragment", // 17
  "```", // 18
  "", // 19
  "```typescript", // 20
  "const t: number = 1;", // 21
  "```", // 22
].join("\n");

describe("extractBlocks", () => {
  test("finds ts, tsx and typescript blocks with the line of their first code line", () => {
    const blocks = extractBlocks(doc, "README.md");
    expect(blocks.map((block) => [block.lang, block.line, block.code])).toEqual([
      ["ts", 8, 'import { a } from "x";\na();'],
      ["tsx", 13, "const view = <div />;"],
      ["ts", 21, "const t: number = 1;"],
    ]);
  });

  test("ignores other languages and blocks marked no-check", () => {
    const codes = extractBlocks(doc, "README.md").map((block) => block.code);
    expect(codes.join("\n")).not.toContain("bun add");
    expect(codes.join("\n")).not.toContain("fragment");
  });

  test("remembers the file it came from", () => {
    expect(extractBlocks(doc, "packages/core/README.md").every((block) => block.file === "packages/core/README.md")).toBe(true);
  });

  test("an unterminated fence is an error, not a silently skipped block", () => {
    expect(() => extractBlocks("```ts\nconst a = 1;\n", "README.md")).toThrow(/never closed/);
  });

  test("fences inside a longer fence are content", () => {
    const nested = ["````md", "```ts", "not code to check", "```", "````", "", "```ts", "const ok = 1;", "```"].join("\n");
    expect(extractBlocks(nested, "README.md").map((block) => block.code)).toEqual(["const ok = 1;"]);
  });
});

describe("readReadme", () => {
  test("returns the text of a README that exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "readme-"));
    try {
      writeFileSync(join(dir, "README.md"), "# Hello\n");
      expect(readReadme(dir, "README.md")).toBe("# Hello\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("names the missing file instead of leaking a raw ENOENT", () => {
    const dir = mkdtempSync(join(tmpdir(), "readme-"));
    try {
      expect(() => readReadme(dir, "packages/core/README.md")).toThrow(/packages\/core\/README\.md.*not found/);
      expect(() => readReadme(dir, "packages/core/README.md")).not.toThrow(/ENOENT/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("moduleSource", () => {
  test("makes every block a module, so top-level names of different blocks never collide", () => {
    expect(moduleSource("const a = 1;")).toBe("const a = 1;\nexport {};\n");
  });
});

describe("mapDiagnostics", () => {
  const blocks: CodeBlock[] = [
    { file: "packages/core/README.md", line: 8, lang: "ts", code: "a" },
    { file: "packages/core/README.md", line: 40, lang: "ts", code: "b" },
  ];

  test("reports a tsc error at the line of the README it came from", () => {
    const output = "packages/core/.readme-check/block-1.tsx(2,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    expect(mapDiagnostics(output, blocks, (index) => `packages/core/.readme-check/block-${index + 1}.tsx`)).toEqual([
      "packages/core/README.md:9:5 TS2322: Type 'string' is not assignable to type 'number'.",
    ]);
  });

  test("keeps unrelated output as it is", () => {
    expect(mapDiagnostics("error: something else", blocks, (index) => `x-${index}.tsx`)).toEqual(["error: something else"]);
  });
});
