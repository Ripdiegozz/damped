import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const docsRoot = resolve(import.meta.dir, "..");
const guides = (slug: string): string => join(docsRoot, "src/content/docs/guides", `${slug}.mdx`);

/** The guides this writer owns, with the sidebar position the plan fixes for each. */
const PAGES = [
  { slug: "layout-and-morph", order: 3, demos: ["FlipReorder", "MorphCard"] },
  { slug: "presence", order: 4, demos: ["PresenceDemo"] },
  { slug: "reduced-motion", order: 6, demos: [] },
  { slug: "react", order: 7, demos: [] },
  { slug: "react-native", order: 8, demos: [] },
  { slug: "faq", order: 10, demos: [] },
] as const;

/** Internal routes that exist, or will once the sibling pages land. */
const KNOWN_ROUTES = new Set([
  "/getting-started/",
  "/guides/springs-explained/",
  "/guides/interruption-and-reversal/",
  "/guides/layout-and-morph/",
  "/guides/presence/",
  "/guides/compositor/",
  "/guides/reduced-motion/",
  "/guides/react/",
  "/guides/react-native/",
  "/guides/testing/",
  "/guides/faq/",
  "/guides/demos/",
  "/reference/core/",
  "/reference/react/",
  "/reference/native/",
  "/playground/",
]);

const read = (slug: string): string => readFileSync(guides(slug), "utf8");

describe("guides (layout, presence, reduced motion, react, native, faq)", () => {
  for (const { slug, order, demos } of PAGES) {
    describe(slug, () => {
      test("exists with a title, a description and its sidebar position", () => {
        expect(existsSync(guides(slug))).toBe(true);
        const page = read(slug);
        const frontmatter = /^---\n([\s\S]*?)\n---/.exec(page)?.[1] ?? "";
        expect(frontmatter).toMatch(/^title: .{3,}$/m);
        expect(frontmatter).toMatch(/^description: .{20,}$/m);
        expect(frontmatter).toMatch(new RegExp(`^sidebar:\\n  order: ${order}$`, "m"));
        expect(page).not.toContain("written in a later task");
      });

      test("embeds its live demos as islands hydrated when visible", () => {
        const page = read(slug);
        for (const demo of demos) {
          expect(page).toMatch(new RegExp(`import \\{ ${demo} \\} from "\\.\\./\\.\\./\\.\\./components/demos/${demo}"`));
          expect(page).toMatch(new RegExp(`<${demo} client:visible />`));
        }
      });

      test("ends with a Next section of LinkCards that point at known pages", () => {
        const page = read(slug);
        const tail = page.slice(page.lastIndexOf("## Next"));
        expect(page).toContain("## Next");
        expect(tail).toMatch(/<LinkCard\b/);
        for (const match of tail.matchAll(/href="([^"]+)"/g)) expect(KNOWN_ROUTES.has(match[1]!)).toBe(true);
      });

      test("links only to pages that exist or are planned", () => {
        const page = read(slug);
        for (const match of page.matchAll(/\]\((\/[^)#\s]*)[^)]*\)/g)) expect(KNOWN_ROUTES.has(match[1]!)).toBe(true);
      });
    });
  }

  test("the reduced-motion guide has an API table and names the override values", () => {
    const page = read("reduced-motion");
    expect(page).toMatch(/\| API \| Reduced-motion behavior \|/);
    for (const value of ['"user"', '"always"', '"never"']) expect(page).toContain(value);
    for (const api of ["animate", "layout", "morph", "enter", "exit", "createSpringValue", "useSpringValue", "withDamped"]) {
      expect(page).toContain(`\`${api}`);
    }
  });

  test("the native guide does not call toReanimated a worklet and states the Reanimated finding", () => {
    const page = read("react-native");
    expect(page).not.toMatch(/toReanimated[^.\n]*\bworklet\b/i);
    expect(page).toContain("4.5.1");
    expect(page).toContain("withSpring");
    expect(page).toContain("withDamped");
  });

  test("the FAQ quotes the committed bundle sizes and has the fair-comparison section", () => {
    const page = read("faq");
    expect(page).toContain("3.95 KB");
    expect(page).toContain("6.99 KB");
    expect(page).toMatch(/^## When to use Motion or Reanimated instead$/m);
    expect(page).toContain("https://motion.dev");
    expect(page).toContain("https://docs.swmansion.com/react-native-reanimated");
  });

  test("the React guide states the render model and the React 19 requirement", () => {
    const page = read("react");
    expect(page).toMatch(/React 19/);
    expect(page).toMatch(/StrictMode/);
    expect(page).not.toMatch(/no StrictMode test/i);
  });
});
