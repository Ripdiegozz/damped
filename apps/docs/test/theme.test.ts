import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { contrast, parseTokens } from "../../../brand/tokens";
import { builtOutputMode } from "./built-output";
import { declarationsOf, rulesOf, targets } from "./css";

// "Quiet chrome, loud motion": the chrome is neutral and set in Geist, and the accent colour belongs to things that
// move or come to rest, the active navigation indicator, focus rings and link underlines. These tests pin that down
// in the sources (what the stylesheets may declare) and in the build (what the pages actually ship).

const docsRoot = resolve(import.meta.dir, "..");
const read = (path: string): string => readFileSync(join(docsRoot, path), "utf8");
const brandTokens = parseTokens(readFileSync(join(docsRoot, "../../brand/tokens.css"), "utf8"));

const stylesheets = readdirSync(join(docsRoot, "src/styles"))
  .filter((name) => name.endsWith(".css"))
  .map((name) => ({ name, source: read(join("src/styles", name)), rules: rulesOf(read(join("src/styles", name))) }));
const declarations = stylesheets.flatMap(({ name, rules }) =>
  rules.flatMap((rule) => declarationsOf(rule.body).map((declaration) => ({ file: name, selector: rule.selector, ...declaration }))),
);

describe("fonts", () => {
  test("Geist and Geist Mono are self-hosted and nothing serif is declared", () => {
    const manifest = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(Object.keys(manifest.dependencies).filter((name) => name.startsWith("@fontsource-variable/")).sort()).toEqual([
      "@fontsource-variable/geist",
      "@fontsource-variable/geist-mono",
    ]);
    const theme = read("src/styles/theme.css");
    expect(theme).toContain("@fontsource-variable/geist/wght.css");
    expect(theme).toContain("@fontsource-variable/geist-mono/wght.css");
    for (const { name, source } of stylesheets) {
      expect(source, name).not.toMatch(/Fraunces|Georgia|Times New Roman|ui-serif|"Inter|JetBrains/);
      expect(source, name).not.toMatch(/(?<!sans-)\bserif\b/);
    }
  });
});

describe("one source of colour", () => {
  test("theme.css imports brand/tokens.css", () => {
    expect(read("src/styles/theme.css")).toMatch(/@import\s+["'][./]*brand\/tokens\.css["']/);
  });

  test("no stylesheet repeats a brand token's hex value", () => {
    const hexes = Object.values(brandTokens).filter((value) => value.startsWith("#"));
    expect(hexes.length).toBeGreaterThan(8);
    const offenders = stylesheets.flatMap(({ name, source }) =>
      hexes.filter((hex) => source.toLowerCase().includes(hex)).map((hex) => `${name}: ${hex}`),
    );
    expect(offenders).toEqual([]);
  });

  test("the text steps clear 4.5:1 on every surface they sit on, in both themes", () => {
    const token = (name: string): string => {
      const value = brandTokens[name];
      if (value === undefined) throw new Error(`brand/tokens.css has no ${name}`);
      return value;
    };
    const surfaces = {
      dark: ["--damped-dark-paper", "--damped-dark-surface", "--damped-dark-raised"],
      light: ["--damped-light-paper", "--damped-light-surface", "--damped-light-raised"],
    };
    for (const theme of ["dark", "light"] as const) {
      for (const surface of surfaces[theme]) {
        for (const text of [`--damped-${theme}-ink`, `--damped-${theme}-ink-muted`, `--damped-accent-text-${theme}`]) {
          expect(contrast(token(text), token(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe("no template tells", () => {
  test("no gradient glow and no box-shadow in the theme stylesheets", () => {
    const glow = declarations.filter(({ value }) => /radial-gradient|--damped-glow/.test(value));
    expect(glow.map(({ file, selector }) => `${file}: ${selector}`)).toEqual([]);
    const shadows = declarations.filter(({ property, value }) => property === "box-shadow" && value !== "none");
    expect(shadows.map(({ file, selector }) => `${file}: ${selector}`)).toEqual([]);
  });

  test("no radius above 6px; circles are the only round shape", () => {
    const offenders = declarations
      .filter(({ property }) => /^border(-[a-z]+)*-radius$/.test(property) || property === "--damped-radius")
      .filter(({ value }) =>
        value
          .split(/[\s/]+/)
          .filter((part) => part !== "")
          .some((part) => {
            if (part === "50%" || part === "0" || part.startsWith("var(") || part === "inherit") return false;
            const length = /^([\d.]+)(px|rem)$/.exec(part);
            return !length || Number(length[1]) * (length[2] === "rem" ? 16 : 1) > 6;
          }),
      );
    expect(offenders.map(({ file, selector, value }) => `${file}: ${selector} { ${value} }`)).toEqual([]);
  });
});

describe("asides are hairline boxes", () => {
  // Every rule that targets an aside element itself (not its title or content): `.starlight-aside` and its variants.
  const aside = declarations.filter(({ selector }) => targets(selector, /^\.starlight-aside(--[a-z]+)?$/));

  test("they are styled at all", () => {
    expect(aside.length).toBeGreaterThan(0);
  });

  test("no start border of any width or colour, and the only border is a 1px hairline on all four sides", () => {
    const start = aside.filter(({ property }) => /^border-(inline-start|inline-end|left|right|top|bottom|block)/.test(property));
    expect(start.map(({ selector, property }) => `${selector} { ${property} }`)).toEqual([]);
    const borders = aside.filter(({ property }) => property === "border");
    expect(borders.length).toBeGreaterThan(0);
    for (const { value } of borders) expect(value).toBe("1px solid var(--damped-hairline)");
  });

  test("no fill but the surface or nothing, and no radius", () => {
    const fills = aside.filter(({ property }) => /^background/.test(property));
    expect(fills.length).toBeGreaterThan(0);
    for (const { value, selector } of fills) expect(["var(--damped-surface)", "transparent"], selector).toContain(value);
    expect(aside.filter(({ property }) => /radius/.test(property))).toEqual([]);
  });

  test("the status dot is never the accent", () => {
    const dots = declarations.filter(({ property }) => property === "--aside-dot");
    expect(dots.length).toBeGreaterThanOrEqual(3);
    for (const { value } of dots) expect(value).not.toMatch(/accent/);
  });
});

describe("focus rings are for the keyboard", () => {
  test("no stylesheet restyles plain :focus with an outline, ring or accent", () => {
    const offenders = declarations
      .filter(({ selector }) => /:focus(?!-visible|-within)/.test(selector))
      .filter(({ property, value }) => /outline|box-shadow|border/.test(property) || /accent/.test(value));
    expect(offenders.map(({ file, selector }) => `${file}: ${selector}`)).toEqual([]);
  });

  test("every outline is set on a :focus-visible selector", () => {
    const outlines = declarations.filter(({ property }) => property === "outline");
    expect(outlines.length).toBeGreaterThan(0);
    expect(outlines.filter(({ selector }) => !/:focus-visible/.test(selector)).map(({ file, selector }) => `${file}: ${selector}`)).toEqual([]);
  });
});

describe("the accent never paints an area", () => {
  // Rules that may fill with the accent because the thing they style is a small marker or indicator: a pseudo-element
  // bar or dot, or an element that moves. Everything else has to stay neutral.
  const MARKERS = [/::(before|after)\s*$/, /-marker\b/, /-ball\b/, /-head\b/, /-dot\b/, /-trace\b/, /-curve\b/];
  const accent = /--damped-accent|--sl-color-(accent|text-accent|bg-accent)|--demo-accent/;

  test("Starlight's own accent variables map to neutrals", () => {
    const mapped = declarations.filter(({ property }) => /^--sl-color-(accent|text-accent|bg-accent)/.test(property));
    expect(mapped.length).toBeGreaterThanOrEqual(3);
    expect(mapped.filter(({ value }) => /--damped-accent/.test(value))).toEqual([]);
  });

  test("only markers and indicators set a background from the accent", () => {
    const offenders = declarations
      .filter(({ property }) => /^background(-color|-image)?$/.test(property))
      .filter(({ value }) => accent.test(value))
      .filter(({ selector }) => !selector.split(",").every((one) => MARKERS.some((marker) => marker.test(one.trim()))));
    expect(offenders.map(({ file, selector, value }) => `${file}: ${selector} { background: ${value} }`)).toEqual([]);
  });
});

const dist = join(docsRoot, "dist");
const mode = builtOutputMode(existsSync(join(dist, "index.html")));
if (mode === "fail") {
  test("the docs are built before the theme tests run", () => {
    throw new Error("apps/docs/dist is missing; run `bun run docs:build` before `bun test` (CI requires it)");
  });
}

/** Attributes of every `<name ...>` tag in a document. */
function tagsOf(html: string, name: string): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "g"))].map(([, attributes]) =>
    Object.fromEntries([...attributes!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key!, value!])),
  );
}

describe.skipIf(mode !== "run")("built theme", () => {
  const css = existsSync(join(dist, "_astro"))
    ? readdirSync(join(dist, "_astro"))
        .filter((name) => name.endsWith(".css"))
        .map((name) => readFileSync(join(dist, "_astro", name), "utf8"))
        .join("\n")
    : "";

  test("the built CSS sets Geist and no other family", () => {
    expect(css).toContain("Geist Variable");
    expect(css).toContain("Geist Mono Variable");
    expect(css).not.toMatch(/Fraunces|Inter Variable|JetBrains Mono/);
  });

  for (const page of ["index.html", "getting-started/index.html"]) {
    describe(page, () => {
      const html = readFileSync(join(dist, page), "utf8");
      const links = tagsOf(html, "link");
      const metas = tagsOf(html, "meta");
      const meta = (key: "name" | "property", value: string) => metas.find((tag) => tag[key] === value)?.content;

      test("declares the favicons, the touch icon and the manifest", () => {
        expect(links.some((tag) => tag.href === "/favicon.svg")).toBe(true);
        expect(links.find((tag) => tag.rel === "icon" && tag.href === "/favicon.ico")?.sizes).toBe("32x32");
        expect(links.some((tag) => tag.rel === "apple-touch-icon" && tag.href === "/apple-touch-icon.png")).toBe(true);
        expect(links.some((tag) => tag.rel === "manifest" && tag.href === "/site.webmanifest")).toBe(true);
      });

      test("sets the theme colour and an absolute social image", () => {
        expect(meta("name", "theme-color")).toBe("#0a0a0b");
        expect(meta("property", "og:image")).toBe("https://damped.dagadev.net/og.png");
        expect(meta("property", "og:image:width")).toBe("1200");
        expect(meta("property", "og:image:height")).toBe("630");
        expect(meta("property", "og:image:alt")).toBeTruthy();
        expect(meta("name", "twitter:card")).toBe("summary_large_image");
        expect(meta("name", "twitter:image")).toBe("https://damped.dagadev.net/og.png");
        expect(meta("name", "twitter:image:alt")).toBeTruthy();
        expect(metas.filter((tag) => tag.name === "twitter:card")).toHaveLength(1);
      });

      test("the header shows the lockup for both themes and no visible site title", () => {
        const title = /<a[^>]*class="site-title[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(html)?.[1] ?? "";
        const images = tagsOf(title, "img");
        expect(images).toHaveLength(2);
        expect(images.map((image) => image.src).join(" ")).toMatch(/lockup-dark[\s\S]*lockup-light|lockup-light[\s\S]*lockup-dark/);
        expect(images.every((image) => image.alt === "damped")).toBe(true);
        expect(/<span[^>]*class="[^"]*\bsr-only\b[^"]*"[^>]*>\s*damped\s*<\/span>/.test(title)).toBe(true);
      });
    });
  }
});
