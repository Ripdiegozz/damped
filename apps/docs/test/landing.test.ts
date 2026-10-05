import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { builtOutputMode, textOf } from "./built-output";

const docsRoot = resolve(import.meta.dir, "..");
const read = (path: string): string => readFileSync(join(docsRoot, path), "utf8");

const PACKAGES = ["@damped/core", "@damped/react", "@damped/native"] as const;
// The guides D6 has to create. The landing links to every one of them.
const PLANNED_GUIDES = [
  "springs-explained",
  "interruption-and-reversal",
  "compositor",
  "reduced-motion",
  "layout-and-morph",
  "presence",
  "react",
  "react-native",
  "testing",
  "faq",
] as const;

/** Every file under `directory` (relative to the docs root) whose name matches `pattern`. */
function filesUnder(directory: string, pattern: RegExp): string[] {
  return (readdirSync(join(docsRoot, directory), { recursive: true }) as string[])
    .filter((entry) => pattern.test(entry))
    .map((entry) => join(directory, entry));
}

describe("landing page source", () => {
  const page = read("src/content/docs/index.mdx");
  const config = read("astro.config.mjs");
  const css = read("src/styles/landing.css");

  test("uses the splash template with a hero whose actions point at the guide, the playground and GitHub", () => {
    expect(page).toMatch(/^template: splash$/m);
    expect(page).toMatch(/text: Get started\s+link: \/getting-started\//);
    expect(page).toMatch(/text: Playground\s+link: \/playground\//);
    expect(page).toMatch(/link: https:\/\/github\.com\/Ripdiegozz\/damped\b/);
  });

  test("overrides the hero so the live spring instrument is an island hydrated on load", () => {
    expect(config).toMatch(/Hero:\s*"\.\/src\/components\/landing\/Hero\.astro"/);
    const hero = read("src/components/landing/Hero.astro");
    expect(hero).toMatch(/<SpringInstrument\b[^>]*\bclient:load\b/);
    expect(hero).not.toContain("MorphCard");
  });

  test("has a plain title: no coloured word, no markup in the heading", () => {
    expect(page).not.toMatch(/^\s*title:.*<[a-z]/m);
    // The heading is the page title, set as is and self-closing: nothing in the component can colour a word of it.
    expect(read("src/components/landing/Hero.astro")).toMatch(/<h1\b[^>]*set:html=\{title\}\s*\/>/);
    expect(css).not.toMatch(/h1\s+(em|span|mark)/);
  });

  test("none of the template patterns are left: card grid, link cards, 2x2 why grid, number band, glow, shadows, big radii", () => {
    expect(page).not.toMatch(/CardGrid|LinkCard/);
    for (const name of ["why-grid", "why-point", "size-strip", "package-card", "package-grid"]) {
      expect(page, name).not.toContain(name);
      expect(css, name).not.toContain(name);
    }
    expect(css).not.toMatch(/gradient|box-shadow|--damped-glow/);
    const radii = [...css.matchAll(/border-radius:\s*([^;]+);/g)].map((match) => match[1]!);
    for (const radius of radii) {
      for (const length of radius.matchAll(/(-?[\d.]+)(px|rem|em|%)?/g)) {
        const px = length[2] === "rem" || length[2] === "em" ? Number(length[1]) * 16 : Number(length[1]);
        // 50% is the instrument's own dots; no box is rounded past 6 px.
        if (length[2] === "%") continue;
        expect(px, `border-radius: ${radius}`).toBeLessThanOrEqual(6);
      }
    }
  });

  test("lists each package with its install command and a link to its reference page", () => {
    for (const name of PACKAGES) {
      const slug = name.replace("@damped/", "");
      expect(page).toContain(`name="${name}"`);
      expect(page).toContain(`bun add ${name}`);
      expect(page).toContain(`npm install ${name}`);
      expect(page).toContain(`href="/reference/${slug}/"`);
    }
    expect(page).toContain("<PackageRow");
  });

  test("numbers the reasons 01 to 04, each with a link to its guide", () => {
    for (const number of ["01", "02", "03", "04"]) expect(page).toContain(`>${number}</span>`);
    for (const slug of ["interruption-and-reversal", "springs-explained", "compositor", "reduced-motion"]) {
      expect(page).toContain(`href="/guides/${slug}/"`);
    }
  });

  test("prints the measured sizes in a spec sheet, and the README quotes the same numbers", () => {
    const readme = readFileSync(resolve(docsRoot, "../../README.md"), "utf8");
    expect(page).toContain('class="spec-sheet');
    for (const figure of ["3.95 KB", "6.99 KB"]) {
      expect(page, figure).toContain(figure);
      expect(readme, figure).toContain(figure);
    }
    expect(page).toContain("0.74 KB");
    expect(page).toMatch(/<td[^>]*>0<\/td>/);
  });

  test("indexes every guide in the docs, so a new guide cannot go missing from the landing page", () => {
    const guides = readdirSync(join(docsRoot, "src/content/docs/guides"))
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => file.replace(/\.mdx$/, ""));
    expect(guides.length).toBeGreaterThanOrEqual(PLANNED_GUIDES.length);
    for (const slug of guides) expect(page, slug).toContain(`href="/guides/${slug}/"`);
    expect(page).toContain('href="/getting-started/"');
  });

  test("links every planned guide", () => {
    for (const slug of PLANNED_GUIDES) expect(page).toContain(`/guides/${slug}/`);
  });

  test("sets a logo and a favicon, both self-hosted", () => {
    expect(config).toContain('dark: "./src/assets/logo-dark.svg"');
    expect(config).toContain('light: "./src/assets/logo-light.svg"');
    expect(existsSync(join(docsRoot, "src/assets/logo-dark.svg"))).toBe(true);
    expect(existsSync(join(docsRoot, "src/assets/logo-light.svg"))).toBe(true);
    expect(config).toMatch(/favicon:\s*"\/favicon\.svg"/);
    expect(existsSync(join(docsRoot, "public/favicon.svg"))).toBe(true);
  });

  test("loads nothing from a third-party host: no font CDN, no remote stylesheet, script or image", () => {
    const sources = [
      ...filesUnder("src", /\.(css|astro|mdx?|tsx?)$/),
      "astro.config.mjs",
    ];
    const remote = /@import\s+(url\()?["']?https?:|url\(\s*["']?https?:|<(link|script|img)\b[^>]*\b(href|src)=["']https?:|fonts\.(googleapis|gstatic)\.com/;
    const offenders = sources.filter((file) => remote.test(read(file)));
    expect(offenders).toEqual([]);
  });
});

// The built page is the real proof; it only exists after `bun run docs:build`. CI builds the docs before `bun test`
// and sets CI=true, so there a missing build fails instead of skipping. The docs smoke e2e covers the same page in a browser.
const built = join(docsRoot, "dist/index.html");
const mode = builtOutputMode(existsSync(built));
if (mode === "fail") {
  test("the docs are built before the tests that read the build output run", () => {
    throw new Error("apps/docs/dist/index.html is missing: run `bun run docs:build` before `bun test` (CI requires it)");
  });
}
describe.skipIf(mode !== "run")("landing page build output", () => {
  const html = existsSync(built) ? readFileSync(built, "utf8") : "";

  test("renders two neutral buttons and a quiet GitHub link in the hero", () => {
    const actions = html.match(/<div class="landing-hero__actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const buttons = [...actions.matchAll(/<a\b[^>]*class="[^"]*\blanding-button\b[^"]*"[^>]*>/g)].map((match) => match[0]);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toContain('href="/getting-started/"');
    expect(buttons[1]).toContain('href="/playground/"');
    expect(actions).toMatch(/<a\b[^>]*class="[^"]*\blanding-quiet\b[^"]*"[^>]*href="https:\/\/github\.com\/Ripdiegozz\/damped"|<a\b[^>]*href="https:\/\/github\.com\/Ripdiegozz\/damped"[^>]*class="[^"]*\blanding-quiet\b/);
    expect(actions).toMatch(/Get started/);
    expect(actions).toMatch(/Playground/);
  });

  test("renders the spring instrument inside an island that hydrates on load, idle and server-rendered", () => {
    expect(html).toMatch(/<astro-island[^>]*\bclient="load"[^>]*>[\s\S]*?data-demo="spring-instrument"/);
    expect(html).toMatch(/data-demo="spring-instrument"[^>]*data-state="idle"|data-state="idle"[^>]*data-demo="spring-instrument"/);
    expect(html).toMatch(/role="slider"/);
    expect(html).not.toContain('data-demo="morph-card"');
    expect(html).not.toMatch(/<[a-z]+\b[^>]*class="[^"]*sl-link-card/);
  });

  test("the title is one plain text node", () => {
    const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
    expect(heading).not.toMatch(/</);
    expect(heading).toContain("Springs that keep their momentum");
  });

  test("lists the three packages as rows", () => {
    for (const name of PACKAGES) expect(html).toContain(name);
    for (const slug of ["core", "react", "native"]) expect(html).toContain(`href="/reference/${slug}/"`);
  });

  test("each package row holds its own install commands and a snippet that imports that package", () => {
    const rows = html.split('<article class="package-row"').slice(1).map((row) => textOf(row.split("</article>")[0] ?? ""));
    expect(rows).toHaveLength(PACKAGES.length);
    const expected: Record<string, { install: string[]; snippet: string }> = {
      "@damped/core": { install: ["bun add @damped/core", "npm install @damped/core"], snippet: 'import { animate } from "@damped/core"' },
      "@damped/react": {
        install: ["bun add @damped/react @damped/core", "npm install @damped/react @damped/core"],
        snippet: 'import { useSpring } from "@damped/react"',
      },
      "@damped/native": { install: ["bun add @damped/native", "npm install @damped/native"], snippet: 'import { withDamped } from "@damped/native"' },
    };
    for (const [index, name] of PACKAGES.entries()) {
      const row = rows[index] ?? "";
      expect(row, name).toContain(name);
      for (const command of expected[name]!.install) expect(row, `${name}: ${command}`).toContain(command);
      expect(row, `${name} snippet`).toContain(expected[name]!.snippet);
      expect(row, `${name} reference link`).toContain("Reference");
    }
  });

  test("numbers the reasons and prints the spec sheet and the guide index", () => {
    expect(html.match(/class="why-list__n"/g)).toHaveLength(4);
    const sheet = textOf(html.match(/<table class="spec-sheet[\s\S]*?<\/table>/)?.[0] ?? "");
    for (const figure of ["3.95 KB", "6.99 KB", "0.74 KB"]) expect(sheet, figure).toContain(figure);
    const index = html.match(/<ul class="guide-index[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect([...index.matchAll(/<li\b/g)].length).toBeGreaterThanOrEqual(PLANNED_GUIDES.length + 1);
  });

  test("requests nothing from another origin", () => {
    // Anchors may point anywhere; resources may not.
    const resources = [...html.matchAll(/<(?:link|script|img|source|iframe)\b[^>]*\b(?:href|src)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    const foreign = resources.filter((url) => url !== undefined && !url.startsWith("https://damped.dagadev.net/"));
    expect(foreign).toEqual([]);
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    for (const css of filesUnder("dist/_astro", /\.css$/)) {
      expect(read(css)).not.toMatch(/@import\s+(url\()?["']?https?:|url\(\s*["']?https?:/);
    }
  });
});
