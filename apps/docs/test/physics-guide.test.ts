import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { builtOutputMode, textOf } from "./built-output";

const docsRoot = resolve(import.meta.dir, "..");
const source = readFileSync(join(docsRoot, "src/content/docs/guides/springs-explained.mdx"), "utf8");

// In reading order: one figure per idea.
const FIGURES = [
  { component: "MassOnSpring", demo: "physics-mass" },
  { component: "DampingRatio", demo: "physics-damping" },
  { component: "PhasePortrait", demo: "physics-phase" },
  { component: "Interruption", demo: "physics-interruption" },
] as const;

// Pages link to this guide by slug, and readers link to its sections.
const ANCHORED_HEADINGS = [
  "Two ways to describe a spring",
  "Which one to use",
  "What `duration` is not",
  "How `bounce` feels",
  "Analytic: the exact state at any time",
  "Velocity continuity",
  "Next",
];

describe("the springs explained guide (source)", () => {
  test("keeps its slug position, title and the sections other pages link to", () => {
    const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1] ?? "";
    expect(frontmatter).toMatch(/^title: Springs explained$/m);
    expect(frontmatter).toMatch(/^sidebar:\n  order: 1$/m);
    for (const heading of ANCHORED_HEADINGS) expect(source).toMatch(new RegExp(`^#{2,3} ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  });

  test("embeds the four figures as islands hydrated when visible, in reading order", () => {
    let last = -1;
    for (const { component } of FIGURES) {
      expect(source).toMatch(new RegExp(`import \\{ ${component} \\} from "\\.\\./\\.\\./\\.\\./components/physics/${component}"`));
      const at = source.indexOf(`<${component} client:visible />`);
      expect(at).toBeGreaterThan(last);
      last = at;
    }
  });

  test("keeps the options table that compares the perceptual and the physical form, and the bounce table", () => {
    expect(source).toContain("| | Perceptual | Physical |");
    expect(source).toContain("| Options | `duration`, `bounce` | `stiffness`, `damping`, `mass` |");
    expect(source).toContain("| Defaults | `duration: 0.5`, `bounce: 0.15` | `mass: 1`; `stiffness` and `damping` have none |");
    expect(source).toContain("| Selected by | Leaving `stiffness` out. | Passing `stiffness` (and then `damping`). |");
    expect(source).toContain("| `bounce` | `zeta` | Peak overshoot | Settles after | Feel |");
    expect(source).toContain("| `0.5` | 0.50 | 16.3 % | 1.53 s | Playful, wobbles before it rests. |");
  });

  test("keeps the conversion formulas and the code that proves them", () => {
    expect(source).toContain("stiffness = omega²");
    expect(source).toContain("damping   = 2 · zeta · omega");
    expect(source).toContain("springParams(");
    expect(source).toContain("createSpring(");
  });

  test("links only to guide pages that exist", () => {
    for (const match of source.matchAll(/\]\((\/[^)#\s]*)[^)]*\)/g)) {
      const path = match[1]!;
      const page = path.replace(/\/$/, "");
      const exists = [`src/content/docs${page}.mdx`, `src/content/docs${page}/index.mdx`].some((candidate) => existsSync(join(docsRoot, candidate)));
      expect(exists).toBe(true);
    }
  });
});

const built = join(docsRoot, "dist/guides/springs-explained/index.html");
const mode = builtOutputMode(existsSync(built));
const builtTest = mode === "skip" ? test.skip : test;

describe("the springs explained guide (built)", () => {
  builtTest("the build exists", () => {
    expect(existsSync(built)).toBe(true);
  });

  builtTest("renders the four figures on the server with their test hooks, as visible islands", () => {
    const html = readFileSync(built, "utf8");
    for (const { demo } of FIGURES) {
      expect(html).toContain(`data-demo="${demo}"`);
      expect(html).toMatch(new RegExp(`<astro-island[^>]*client="visible"[^>]*>(?:(?!</astro-island>)[\\s\\S])*data-demo="${demo}"`));
    }
    expect(html.match(/data-state="idle"/g)?.length).toBeGreaterThanOrEqual(FIGURES.length);
  });

  builtTest("every figure has a name, an accessible control and a polite description before any script runs", () => {
    const html = readFileSync(built, "utf8");
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('type="range"');
    expect(textOf(html)).toContain("Interrupting a spring");
  });

  builtTest("still shows the options table", () => {
    const text = textOf(readFileSync(built, "utf8"));
    expect(text).toContain("Perceptual");
    expect(text).toContain("Physical");
    expect(text).toContain("Selected by");
  });
});
