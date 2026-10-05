import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { builtOutputMode } from "../../docs/test/built-output";

// The tab icon and the share card are part of the playground's head. Local assets use relative URLs so the site
// works at / and under /playground/; only the share card and URL are absolute, because crawlers need them to be.

const root = resolve(import.meta.dir, "..");
const dist = join(root, "dist");
const publicDir = join(root, "public");
const source = readFileSync(join(root, "index.html"), "utf8");

/** The attributes of every tag with the given name, as plain objects. */
function tags(html: string, name: string): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${name}\\s([^>]*?)/?>`, "g"))].map(([, attributes]) =>
    Object.fromEntries([...attributes!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key!, value!])),
  );
}

const meta = (html: string, key: string): string | undefined =>
  tags(html, "meta").find((tag) => tag.name === key || tag.property === key)?.content;

function headChecks(html: string): void {
  const links = tags(html, "link");
  expect(links).toContainEqual({ rel: "icon", href: "./favicon.svg", type: "image/svg+xml" });
  expect(links).toContainEqual({ rel: "icon", href: "./favicon.ico", sizes: "32x32" });
  expect(links).toContainEqual({ rel: "apple-touch-icon", href: "./apple-touch-icon.png" });
  expect(meta(html, "theme-color")).toBe("#f1f2f4");
  expect(meta(html, "og:title")).toBe("Northbook | damped playground");
  expect(meta(html, "og:description")).toBe(meta(html, "description")!);
  expect(meta(html, "og:type")).toBe("website");
  expect(meta(html, "og:url")).toBe("https://damped.dagadev.net/playground/");
  expect(meta(html, "og:image")).toBe("https://damped.dagadev.net/og.png");
  expect(meta(html, "twitter:card")).toBe("summary_large_image");
  expect(meta(html, "twitter:image")).toBe("https://damped.dagadev.net/og.png");
  // Everything local stays relative, so the page works below any prefix.
  for (const link of links) expect(link.href!.startsWith("./"), `${link.href} is not relative`).toBe(true);
}

describe("playground head", () => {
  test("the source declares the icons, the theme colour and the share card", () => {
    headChecks(source);
  });

  test("the theme colour is the playground's own page background", () => {
    const css = readFileSync(join(root, "src/styles.css"), "utf8");
    expect(css).toContain(`--bg: ${meta(source, "theme-color")};`);
  });
});

const built = builtOutputMode(existsSync(join(dist, "index.html")));
const builtTest = built === "skip" ? test.skip : test;

describe("built playground", () => {
  builtTest("dist/index.html carries the same head", () => {
    expect(built).not.toBe("fail");
    headChecks(readFileSync(join(dist, "index.html"), "utf8"));
  });

  builtTest("dist/ holds every file of public/, unchanged, so a new asset needs no build change", () => {
    expect(built).not.toBe("fail");
    const names = readdirSync(publicDir);
    expect(names).toEqual(expect.arrayContaining(["favicon.svg", "favicon.ico", "apple-touch-icon.png"]));
    for (const name of names) {
      expect(existsSync(join(dist, name)), `${name} is missing from dist/`).toBe(true);
      expect(readFileSync(join(dist, name)).equals(readFileSync(join(publicDir, name)))).toBe(true);
    }
  });

  builtTest("every local href of the built page resolves to a file in dist/", () => {
    expect(built).not.toBe("fail");
    const html = readFileSync(join(dist, "index.html"), "utf8");
    for (const { href } of tags(html, "link")) expect(existsSync(join(dist, href!)), `${href} is missing`).toBe(true);
  });
});
