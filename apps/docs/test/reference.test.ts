// The guard that keeps the API reference complete: every export of every package entry has its own
// heading (a stable anchor) with the parts a reader needs, and every reference page is reachable.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { selectExamples } from "../scripts/examples";
import { exportedNames, markdownHeadings, section } from "../scripts/exports";
import type { Heading } from "../scripts/exports";

const docsRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(docsRoot, "../..");
const referenceRoot = join(docsRoot, "src/content/docs/reference");

interface Page {
  /** Path below `reference/`, without the extension: `core/animate`, `react`. */
  name: string;
  source: string;
  headings: Heading[];
}

function pages(directory: string, prefix: string): Page[] {
  // A package whose reference directory does not exist yet has no pages; the tests then report every export as missing.
  if (!existsSync(join(referenceRoot, directory))) return [];
  return readdirSync(join(referenceRoot, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
    .map((entry) => {
      const source = readFileSync(join(referenceRoot, directory, entry.name), "utf8");
      return { name: `${prefix}${entry.name.replace(/\.mdx$/, "")}`, source, headings: markdownHeadings(source) };
    });
}

function file(name: string): Page {
  const source = readFileSync(join(referenceRoot, `${name}.mdx`), "utf8");
  return { name, source, headings: markdownHeadings(source) };
}

const packages: { name: string; entry: string; pages: Page[] }[] = [
  { name: "@damped/core", entry: "packages/core/src/index.ts", pages: pages("core", "core/") },
  { name: "@damped/react", entry: "packages/react/src/index.ts", pages: [file("react")] },
  { name: "@damped/native", entry: "packages/native/src/index.ts", pages: [file("native")] },
];

describe.each(packages)("$name reference", ({ entry, pages: documents }) => {
  test("every export has a heading with its exact name, once", async () => {
    const names = await exportedNames(join(repoRoot, entry));
    const exported = [...names.runtime, ...names.types].sort();
    expect(exported.length).toBeGreaterThan(0);

    const missing: string[] = [];
    const repeated: string[] = [];
    for (const name of exported) {
      const found = documents.flatMap((page) => page.headings.filter((heading) => heading.text === name).map((heading) => `${page.name}#${heading.slug}`));
      if (found.length === 0) missing.push(name);
      if (found.length > 1) repeated.push(`${name}: ${found.join(", ")}`);
    }
    expect({ missing, repeated }).toEqual({ missing: [], repeated: [] });
  });

  test("every export section has a signature, an example that typechecks and a See also line", async () => {
    const names = await exportedNames(join(repoRoot, entry));
    const problems: string[] = [];
    for (const name of [...names.runtime, ...names.types].sort()) {
      for (const page of documents) {
        const heading = page.headings.find((candidate) => candidate.text === name);
        if (heading === undefined) continue;
        const body = section(page.source, page.headings, heading);
        const blocks = selectExamples(body, page.name);
        const signatures = [...body.matchAll(/^```(?:ts|tsx)\s+nocheck\s*$/gm)].length;
        if (signatures === 0) problems.push(`${page.name}#${heading.slug}: no signature block (a ts block marked nocheck)`);
        if (blocks.length === 0) problems.push(`${page.name}#${heading.slug}: no checked example`);
        if (!body.includes("**See also**")) problems.push(`${page.name}#${heading.slug}: no See also line`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("no heading text repeats on a page, so every anchor names one thing", () => {
    for (const page of documents) {
      const texts = page.headings.map((heading) => heading.text);
      const repeated = texts.filter((text, index) => texts.indexOf(text) !== index);
      expect({ page: page.name, repeated }).toEqual({ page: page.name, repeated: [] });
    }
  });
});

describe("reachability", () => {
  const config = readFileSync(join(docsRoot, "astro.config.mjs"), "utf8");

  test("the three package URLs keep working", () => {
    expect(existsSync(join(referenceRoot, "core/index.mdx"))).toBe(true);
    expect(readdirSync(referenceRoot)).toEqual(expect.arrayContaining(["react.mdx", "native.mdx"]));
    expect(readdirSync(referenceRoot)).not.toContain("core.mdx");
  });

  test("every reference page is in the sidebar", () => {
    const names = ["react", "native", "core", ...(packages[0]?.pages ?? []).map((page) => page.name).filter((name) => name !== "core/index")];
    expect(names.filter((name) => !config.includes(`"reference/${name}"`))).toEqual([]);
  });

  test("the core overview links to every core page", () => {
    const index = (packages[0]?.pages ?? []).find((page) => page.name === "core/index");
    expect(index).toBeDefined();
    for (const page of (packages[0]?.pages ?? []).filter((candidate) => candidate.name !== "core/index")) {
      expect(index?.source).toContain(`/reference/${page.name}/`);
    }
  });
});
