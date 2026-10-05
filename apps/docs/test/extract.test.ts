import { describe, expect, test } from "bun:test";
import { extractCodeBlocks, mapDiagnostics, parseTscOutput, selectExamples } from "../scripts/examples";

const fence = "```";

describe("extractCodeBlocks", () => {
  test("returns the lang, info string, code and opening fence line of every block", () => {
    const source = ["# Title", "", `${fence}ts title="a.ts"`, "const a = 1;", "const b = 2;", fence, "", `${fence}bash`, "bun add x", fence].join(
      "\n",
    );
    expect(extractCodeBlocks(source)).toEqual([
      { lang: "ts", info: 'ts title="a.ts"', code: "const a = 1;\nconst b = 2;", line: 3 },
      { lang: "bash", info: "bash", code: "bun add x", line: 8 },
    ]);
  });

  test("keeps a longer fence open until a fence at least as long closes it", () => {
    const source = ["````md", `${fence}ts`, "const nested = true;", fence, "````", "", `${fence}ts`, "const after = 1;", fence].join("\n");
    const blocks = extractCodeBlocks(source);
    expect(blocks.map((block) => block.lang)).toEqual(["md", "ts"]);
    expect(blocks[0]?.code).toBe(`${fence}ts\nconst nested = true;\n${fence}`);
    expect(blocks[1]).toMatchObject({ code: "const after = 1;", line: 7 });
  });

  test("does not close a fence on a different fence character or on a fence with trailing text", () => {
    const source = [`${fence}ts`, "~~~", `${fence}js`, "const x = 1;", fence].join("\n");
    const blocks = extractCodeBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.code).toBe(`~~~\n${fence}js\nconst x = 1;`);
  });

  test("supports tilde fences", () => {
    expect(extractCodeBlocks(["~~~tsx", "const a = <div />;", "~~~"].join("\n"))).toEqual([
      { lang: "tsx", info: "tsx", code: "const a = <div />;", line: 1 },
    ]);
  });

  test("removes the fence indentation from indented blocks", () => {
    const source = ["- item", "", `  ${fence}ts`, "  const a = {", "    b: 1,", "  };", `  ${fence}`].join("\n");
    expect(extractCodeBlocks(source)[0]).toMatchObject({ code: "const a = {\n  b: 1,\n};", line: 3 });
  });

  test("closes a tab-indented block on its own tab-indented fence instead of swallowing the rest of the file", () => {
    const source = ["-\titem", "", `\t${fence}ts`, "\tconst a = 1;", `\t${fence}`, "", "Prose.", "", `${fence}ts`, "const b = 2;", fence].join("\n");
    const blocks = extractCodeBlocks(source);
    expect(blocks.map((block) => block.code)).toEqual(["const a = 1;", "const b = 2;"]);
    expect(blocks[1]).toMatchObject({ line: 9 });
  });

  test("closes a block nested four spaces deep (a list item) on its fence, however deep it is indented", () => {
    const source = ["1. Step", "", `    ${fence}ts`, "    const a = 1;", `    ${fence}`, "", `${fence}ts`, "const b = 2;", fence].join("\n");
    expect(extractCodeBlocks(source).map((block) => block.code)).toEqual(["const a = 1;", "const b = 2;"]);
  });

  test("reads a block that never closes up to the end of the file", () => {
    expect(extractCodeBlocks([`${fence}ts`, "const a = 1;"].join("\n"))).toEqual([
      { lang: "ts", info: "ts", code: "const a = 1;", line: 1 },
    ]);
  });

  test("handles CRLF line endings and blocks without a lang", () => {
    const blocks = extractCodeBlocks([`${fence}`, "plain", fence, `${fence}ts`, "const a = 1;", fence].join("\r\n"));
    expect(blocks).toEqual([
      { lang: "", info: "", code: "plain", line: 1 },
      { lang: "ts", info: "ts", code: "const a = 1;", line: 4 },
    ]);
  });

  test("returns an empty list for a document without code", () => {
    expect(extractCodeBlocks("# Nothing here\n\nJust `inline` code.")).toEqual([]);
  });
});

describe("selectExamples", () => {
  const source = [
    `${fence}ts`,
    "const a = 1;",
    fence,
    `${fence}TypeScript`,
    "const b = 2;",
    fence,
    `${fence}tsx title="c.tsx"`,
    "const c = <p />;",
    fence,
    `${fence}ts nocheck`,
    "const broken: number = 'x';",
    fence,
    `${fence}js`,
    "const d = 4;",
    fence,
    `${fence}bash`,
    "bun add x",
    fence,
  ].join("\n");

  test("keeps ts, tsx and typescript blocks, case-insensitively, and skips nocheck and other langs", () => {
    const examples = selectExamples(source, "guides/a.mdx");
    expect(examples.map((example) => [example.lang, example.line])).toEqual([
      ["ts", 1],
      ["TypeScript", 4],
      ["tsx", 7],
    ]);
    expect(examples.every((example) => example.file === "guides/a.mdx")).toBe(true);
  });

  test("matches nocheck as a whole word only", () => {
    const examples = selectExamples([`${fence}ts title="nochecker.ts"`, "const a = 1;", fence].join("\n"), "a.md");
    expect(examples).toHaveLength(1);
  });

  test("skips empty blocks", () => {
    expect(selectExamples([`${fence}ts`, fence].join("\n"), "a.md")).toEqual([]);
  });
});

describe("parseTscOutput", () => {
  test("parses file, line, column, code and message, and joins continuation lines", () => {
    const output = [
      "/tmp/x/0001.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      "  Type detail on a continuation line.",
      "/tmp/x/0002.tsx(1,1): error TS2304: Cannot find name 'foo'.",
      "Found 2 errors.",
    ].join("\n");
    expect(parseTscOutput(output)).toEqual([
      {
        file: "/tmp/x/0001.ts",
        line: 3,
        column: 7,
        code: "TS2322",
        message: "Type 'string' is not assignable to type 'number'.\n  Type detail on a continuation line.",
      },
      { file: "/tmp/x/0002.tsx", line: 1, column: 1, code: "TS2304", message: "Cannot find name 'foo'." },
    ]);
  });

  test("returns nothing for clean output", () => {
    expect(parseTscOutput("")).toEqual([]);
  });
});

describe("mapDiagnostics", () => {
  const example = { file: "guides/a.mdx", lang: "ts", info: "ts", code: "const a = 1;", line: 10 };

  test("names the source file and the line of the failing statement inside the document", () => {
    const [message] = mapDiagnostics(
      [{ file: "/tmp/x/0000.ts", line: 2, column: 5, code: "TS2322", message: "Bad type." }],
      new Map([["/tmp/x/0000.ts", example]]),
    );
    expect(message).toBe("guides/a.mdx:12:5 (code block at line 10): TS2322 Bad type.");
  });

  test("reports diagnostics from files outside the examples without a mapping as they are", () => {
    const [message] = mapDiagnostics(
      [{ file: "/repo/packages/core/src/x.ts", line: 1, column: 1, code: "TS1005", message: "Oops." }],
      new Map(),
    );
    expect(message).toBe("/repo/packages/core/src/x.ts:1:1: TS1005 Oops.");
  });
});
