// Helpers behind scripts/check-readme-examples.ts, kept apart so they can be tested.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface CodeBlock {
  /** The markdown file the block is in, relative to the repository root. */
  file: string;
  /** Line of the first line of code in that file (1-based). */
  line: number;
  lang: "ts" | "tsx";
  code: string;
}

const FENCE = /^(?<indent>\s*)(?<marker>`{3,}|~{3,})\s*(?<language>[^\s`]*)\s*(?<rest>.*)$/;
const CHECKED = new Set(["ts", "tsx", "typescript"]);

/** The text of a README listed in the checker, or an error that names the file when it is not there. */
export function readReadme(root: string, file: string): string {
  try {
    return readFileSync(join(root, file), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${file}: README not found; remove it from READMES in scripts/check-readme-examples.ts or create it`);
    }
    throw error;
  }
}

/**
 * The TypeScript blocks of a markdown file that should compile. A block whose info string contains `no-check` is a
 * fragment on purpose and is skipped; every other language is ignored. A fence is closed by a fence of the same
 * character that is at least as long, so a longer fence can show a shorter one as content.
 */
export function extractBlocks(markdown: string, file: string): CodeBlock[] {
  const lines = markdown.split("\n");
  const blocks: CodeBlock[] = [];
  for (let index = 0; index < lines.length; index++) {
    const open = FENCE.exec(lines[index]!);
    if (open === null) continue;
    const { marker = "", language = "", rest = "" } = open.groups ?? {};
    const start = index + 1;
    let end = start;
    while (end < lines.length) {
      const close = FENCE.exec(lines[end]!)?.groups;
      // A closing fence uses the same character, is at least as long as the opening one, and carries no info string.
      const closes =
        close !== undefined &&
        close.marker![0] === marker[0] &&
        close.marker!.length >= marker.length &&
        close.language === "" &&
        close.rest === "";
      if (closes) break;
      end++;
    }
    if (end >= lines.length) throw new Error(`${file}:${index + 1}: the code fence was never closed`);
    if (CHECKED.has(language) && !rest.split(/\s+/).includes("no-check")) {
      blocks.push({ file, line: start + 1, lang: language === "tsx" ? "tsx" : "ts", code: lines.slice(start, end).join("\n") });
    }
    index = end;
  }
  return blocks;
}

/** Each block is compiled as its own module, so two blocks can both declare `const el`. */
export const moduleSource = (code: string): string => `${code}\nexport {};\n`;

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** Rewrites tsc's `file(line,col): error TS…` lines so they point at the README line the code came from. */
export function mapDiagnostics(output: string, blocks: readonly CodeBlock[], fileOf: (index: number) => string): string[] {
  const byFile = new Map(blocks.map((block, index) => [fileOf(index), block] as const));
  const result: string[] = [];
  for (const text of output.split("\n")) {
    if (text.trim() === "") continue;
    const match = DIAGNOSTIC.exec(text);
    const block = match === null ? undefined : byFile.get(match[1]!);
    if (match === null || block === undefined) {
      result.push(text);
      continue;
    }
    result.push(`${block.file}:${block.line + Number(match[2]) - 1}:${match[3]} ${match[4]}: ${match[5]}`);
  }
  return result;
}
