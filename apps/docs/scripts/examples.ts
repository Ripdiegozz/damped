// Pure helpers behind the docs example typecheck: pull fenced code blocks out of Markdown or MDX
// and map TypeScript diagnostics back to the document. No file system or process access here.

export interface CodeBlock {
  /** The first word of the info string, as written (`ts`, `tsx`, `TypeScript`, ...). Empty without one. */
  lang: string;
  /** The complete info string after the fence, for markers such as `nocheck`. */
  info: string;
  /** The block contents, without the fences and without the fence indentation. */
  code: string;
  /** The 1-based line of the opening fence. The first code line is `line + 1`. */
  line: number;
}

export interface Example extends CodeBlock {
  file: string;
}

export interface TscDiagnostic {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

const CHECKED_LANGS = new Set(["ts", "tsx", "typescript"]);
// Any indentation: blocks inside list items sit four or more spaces (or a tab) deep.
const OPENING_FENCE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

/** Finds the fenced code blocks of a CommonMark-style document. A longer fence can contain shorter ones. */
export function extractCodeBlocks(source: string): CodeBlock[] {
  const lines = source.split(/\r?\n/);
  const blocks: CodeBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const opening = OPENING_FENCE.exec(lines[index] ?? "");
    const marker = opening?.[2];
    // A backtick fence cannot carry backticks in its info string, which keeps inline code lines out.
    if (opening === null || marker === undefined || (marker.startsWith("`") && (opening[3] ?? "").includes("`"))) {
      index += 1;
      continue;
    }

    const indent = (opening[1] ?? "").length;
    const info = (opening[3] ?? "").trim();
    // The closing fence may be indented like the opening one (or less, or more), so a nested block never swallows the file.
    const closing = new RegExp(`^[ \\t]*\\${marker[0]}{${marker.length},}\\s*$`);
    const start = index;
    const body: string[] = [];
    index += 1;
    while (index < lines.length && !closing.test(lines[index] ?? "")) {
      body.push(stripIndent(lines[index] ?? "", indent));
      index += 1;
    }
    index += 1; // skip the closing fence, if there was one

    blocks.push({ lang: info.split(/\s+/)[0] ?? "", info, code: body.join("\n"), line: start + 1 });
  }
  return blocks;
}

function stripIndent(line: string, width: number): string {
  let removed = 0;
  while (removed < width && (line[removed] === " " || line[removed] === "\t")) removed += 1;
  return line.slice(removed);
}

/** The blocks that must typecheck: ts, tsx and typescript, minus empty ones and those marked `nocheck`. */
export function selectExamples(source: string, file: string): Example[] {
  return extractCodeBlocks(source)
    .filter((block) => CHECKED_LANGS.has(block.lang.toLowerCase()))
    .filter((block) => !/(^|\s)nocheck(\s|$)/.test(block.info))
    .filter((block) => block.code.trim() !== "")
    .map((block) => ({ ...block, file }));
}

const DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** Parses `tsc --pretty false` output. Indented lines continue the previous message. */
export function parseTscOutput(output: string): TscDiagnostic[] {
  const diagnostics: TscDiagnostic[] = [];
  for (const text of output.split(/\r?\n/)) {
    const match = DIAGNOSTIC.exec(text);
    if (match !== null) {
      const [, file = "", line = "0", column = "0", code = "", message = ""] = match;
      diagnostics.push({ file, line: Number(line), column: Number(column), code, message });
    } else if (/^\s+\S/.test(text)) {
      const last = diagnostics.at(-1);
      if (last !== undefined) last.message += `\n${text}`;
    }
  }
  return diagnostics;
}

/**
 * Formats diagnostics for a failure message. Diagnostics inside an extracted example point at the
 * document and the line of the failing statement; the opening fence line is added for orientation.
 */
export function mapDiagnostics(diagnostics: TscDiagnostic[], examples: ReadonlyMap<string, Example>): string[] {
  return diagnostics.map((diagnostic) => {
    const example = examples.get(diagnostic.file);
    if (example === undefined) {
      return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.code} ${diagnostic.message}`;
    }
    const line = example.line + diagnostic.line;
    return `${example.file}:${line}:${diagnostic.column} (code block at line ${example.line}): ${diagnostic.code} ${diagnostic.message}`;
  });
}
