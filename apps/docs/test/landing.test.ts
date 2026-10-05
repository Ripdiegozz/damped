import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

  test("uses the splash template with a hero whose actions point at the guide, the playground and GitHub", () => {
    expect(page).toMatch(/^template: splash$/m);
    expect(page).toMatch(/text: Get started\s+link: \/getting-started\//);
    expect(page).toMatch(/text: Try the playground\s+link: \/playground\//);
    expect(page).toMatch(/link: https:\/\/github\.com\/Ripdiegozz\/damped\b/);
  });

  test("overrides the hero so the live morph card is an island hydrated on load", () => {
    expect(config).toMatch(/Hero:\s*"\.\/src\/components\/landing\/Hero\.astro"/);
    const hero = read("src/components/landing/Hero.astro");
    expect(hero).toMatch(/<MorphCard\b[^>]*\bclient:load\b[^>]*\bvariant="compact"|<MorphCard\b[^>]*\bvariant="compact"[^>]*\bclient:load\b/);
    expect(hero).toContain("Esc");
  });

  test("has one card per package with its install command and a link to its reference page", () => {
    for (const name of PACKAGES) {
      const slug = name.replace("@damped/", "");
      expect(page).toContain(`name="${name}"`);
      expect(page).toContain(`bun add ${name}`);
      expect(page).toContain(`npm install ${name}`);
      expect(page).toContain(`href="/reference/${slug}/"`);
    }
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

// The built page is the real proof; it only exists after `bun run docs:build`, which CI runs after `bun test`.
// The docs smoke e2e covers the same page in a browser.
const built = join(docsRoot, "dist/index.html");
describe.skipIf(!existsSync(built))("landing page build output", () => {
  const html = existsSync(built) ? readFileSync(built, "utf8") : "";

  test("renders the hero actions as links", () => {
    expect(html).toMatch(/<a[^>]*href="\/getting-started\/"[^>]*>[\s\S]*?Get started/);
    expect(html).toMatch(/<a[^>]*href="\/playground\/"[^>]*>[\s\S]*?Try the playground/);
    expect(html).toMatch(/<a[^>]*href="https:\/\/github\.com\/Ripdiegozz\/damped"/);
  });

  test("renders the compact morph card inside an island that hydrates on load", () => {
    expect(html).toMatch(/<astro-island[^>]*\bclient="load"[^>]*>[\s\S]*?data-demo="morph-card"/);
    expect(html).toContain("morph-demo--compact");
    expect(html).toMatch(/data-state="idle"/);
  });

  test("shows the three package cards", () => {
    for (const name of PACKAGES) expect(html).toContain(name);
    for (const slug of ["core", "react", "native"]) expect(html).toContain(`href="/reference/${slug}/"`);
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
