// Pure helpers behind the reference completeness test: list the public exports of a package entry by
// following its re-exports, and read the headings of a Markdown or MDX page.
//
// TypeScript 7 ships no JavaScript compiler API, so the entries are read with a small scanner instead:
// comments and strings are blanked out, then the statements at brace depth 0 are matched. That covers
// every export form the packages use (`export *`, `export * as`, named and type-only re-exports with
// `as`, and local declarations); the tests below pin each form.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface ExportedNames {
  /** Values: functions, constants, classes, enums and namespaces. */
  runtime: Set<string>;
  /** Interfaces and type aliases, including type-only re-exports. */
  types: Set<string>;
}

type Kind = "runtime" | "type";

/** The public names of a module, following `export *`, named and type-only re-exports and local declarations. */
export async function exportedNames(entry: string): Promise<ExportedNames> {
  const result: ExportedNames = { runtime: new Set(), types: new Set() };
  for (const [name, kind] of collect(entry, new Set())) (kind === "type" ? result.types : result.runtime).add(name);
  return result;
}

interface Statement {
  index: number;
  match: RegExpMatchArray;
}

/** The source with comments and the contents of string literals blanked out, same length, same lines. */
function blank(code: string): string {
  let out = "";
  for (let index = 0; index < code.length; ) {
    const char = code[index] ?? "";
    const next = code[index + 1] ?? "";
    if (char === "/" && next === "/") {
      const end = code.indexOf("\n", index);
      const stop = end === -1 ? code.length : end;
      out += " ".repeat(stop - index);
      index = stop;
    } else if (char === "/" && next === "*") {
      const end = code.indexOf("*/", index + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += code.slice(index, stop).replace(/[^\n]/g, " ");
      index = stop;
    } else if (char === '"' || char === "'" || char === "`") {
      let stop = index + 1;
      while (stop < code.length && code[stop] !== char) stop += code[stop] === "\\" ? 2 : 1;
      // Keep the quotes and the text, so module specifiers can still be read; only comments are dropped.
      out += code.slice(index, stop + 1);
      index = stop + 1;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

/** Braces, brackets and parentheses nesting before each character. */
function depths(code: string): number[] {
  const result: number[] = [];
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < code.length; index += 1) {
    const char = code[index] ?? "";
    if (quote !== undefined) {
      if (char === "\\") {
        result.push(depth, depth);
        index += 1;
        continue;
      }
      if (char === quote) quote = undefined;
      result.push(depth);
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    if ("{[(".includes(char)) {
      result.push(depth);
      depth += 1;
      continue;
    }
    if ("}])".includes(char)) depth -= 1;
    result.push(depth);
  }
  return result;
}

function topLevel(code: string, depth: readonly number[], pattern: RegExp): Statement[] {
  return [...code.matchAll(pattern)]
    .filter((match) => match.index !== undefined && depth[match.index + (match[0].length - match[0].trimStart().length)] === 0)
    .map((match) => ({ index: match.index ?? 0, match }));
}

const DECLARATION = "(function\\*?|class|abstract\\s+class|interface|type|enum|const\\s+enum|const|let|var|namespace)\\s+([A-Za-z_$][\\w$]*)";

function kindOf(keyword: string): Kind {
  return keyword === "interface" || keyword === "type" ? "type" : "runtime";
}

function collect(file: string, visiting: Set<string>): Map<string, Kind> {
  const names = new Map<string, Kind>();
  if (visiting.has(file)) return names;
  visiting.add(file);

  const code = blank(readFileSync(file, "utf8"));
  const depth = depths(code);

  // Local declarations, so `export { name }` can tell a type from a value.
  const local = new Map<string, Kind>();
  for (const { match } of topLevel(code, depth, new RegExp(`(?:^|[;\\n}])\\s*(?:export\\s+)?(?:declare\\s+)?(?:async\\s+)?${DECLARATION}`, "g"))) {
    local.set(match[2] ?? "", kindOf(match[1] ?? ""));
  }

  // export * from "./x" and export * as ns from "./x"
  for (const { match } of topLevel(code, depth, /\bexport\s+(?:type\s+)?\*\s*(?:as\s+([\w$]+)\s+)?from\s*["']([^"']+)["']/g)) {
    if (match[1] !== undefined) {
      names.set(match[1], "runtime");
      continue;
    }
    const target = resolveModule(file, match[2] ?? "");
    for (const [name, kind] of target === undefined ? [] : collect(target, visiting)) names.set(name, kind);
  }

  // export { a, b as c, type D } [from "./x"] and export type { ... }
  for (const { match } of topLevel(code, depth, /\bexport\s+(type\s+)?\{([^}]*)\}\s*(?:from\s*["']([^"']+)["'])?/g)) {
    const target = match[3] === undefined ? undefined : resolveModule(file, match[3]);
    const exported = target === undefined ? undefined : collect(target, visiting);
    for (const item of (match[2] ?? "").split(",")) {
      const element = /^\s*(type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?\s*$/.exec(item);
      if (element === null) continue;
      const original = element[2] ?? "";
      const known = exported?.get(original) ?? local.get(original) ?? "runtime";
      names.set(element[3] ?? original, match[1] !== undefined || element[1] !== undefined ? "type" : known);
    }
  }

  // export function f, export const c, export interface I, export type T, ...
  for (const { match } of topLevel(code, depth, new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?${DECLARATION}`, "g"))) {
    names.set(match[2] ?? "", kindOf(match[1] ?? ""));
  }

  visiting.delete(file);
  return names;
}

function resolveModule(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = join(dirname(from), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(`Cannot resolve "${specifier}" from ${from}`);
}

export interface Heading {
  level: number;
  /** The heading text without inline code marks. */
  text: string;
  /** The anchor Starlight generates (github-slugger rules). */
  slug: string;
  /** 1-based line in the document. */
  line: number;
}

/** The ATX headings of a document, skipping front matter and fenced code. */
export function markdownHeadings(source: string): Heading[] {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const lines = source.split(/\r?\n/);
  let fence: string | undefined;
  let index = 0;
  if (lines[0]?.trim() === "---") {
    index = lines.findIndex((line, position) => position > 0 && line.trim() === "---") + 1;
  }
  for (; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== undefined) {
      if (opening !== null && line.trim().startsWith(fence[0] ?? "") && (opening[1] ?? "").length >= fence.length && line.trim() === (opening[1] ?? "")) fence = undefined;
      continue;
    }
    if (opening !== null) {
      fence = opening[1];
      continue;
    }
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (match === null) continue;
    const text = (match[2] ?? "").replaceAll("`", "");
    // Starlight gives the second heading with the same slug a `-1` suffix, the third `-2`, and so on.
    const base = slugify(text);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    headings.push({ level: (match[1] ?? "").length, text, slug: count === 0 ? base : `${base}-${count}`, line: index + 1 });
  }
  return headings;
}

/** github-slugger: lowercase, drop punctuation other than hyphens and underscores, spaces become hyphens. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, "")
    .replaceAll(" ", "-");
}

/** The text from a heading up to the next heading of the same or a higher level. */
export function section(source: string, headings: readonly Heading[], heading: Heading): string {
  const lines = source.split(/\r?\n/);
  const next = headings.find((candidate) => candidate.line > heading.line && candidate.level <= heading.level);
  return lines.slice(heading.line - 1, next === undefined ? lines.length : next.line - 1).join("\n").trimEnd();
}
