import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Crawls a built static site and checks that every internal link and asset resolves to a file, and that every
// #anchor has an element with that id. Node APIs only, so Bun tests and the Playwright runner can both import it.

export interface LinkProblem {
  /** The URL path of the page the reference is on, for example `/guides/demos/`. */
  page: string;
  /** The reference as written (or its absolute form when it was relative to the page). */
  target: string;
  reason: string;
}

export interface Reference {
  tag: string;
  attribute: string;
  url: string;
}

export interface CheckOptions {
  /** Absolute URLs on this origin are internal and checked like a root-relative link. */
  origin?: string;
}

const TAG = /<(a|link|script|img|source|iframe|video|audio|use|image|astro-island)\b([^>]*)>/gi;
const ATTRIBUTES = /\s(href|src|srcset|poster|component-url|renderer-url|before-hydration-url)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

const decode = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

/** Every link and asset reference of an HTML document (real tags only: escaped code samples are text). */
export function extractReferences(html: string): Reference[] {
  const references: Reference[] = [];
  for (const tag of html.matchAll(TAG)) {
    // `<link rel="canonical">` states the page's own address (the 404 page's does not exist as a file); nobody follows it.
    if (tag[1]!.toLowerCase() === "link" && /\srel\s*=\s*["']?canonical\b/i.test(tag[2] ?? "")) continue;
    for (const attribute of (tag[2] ?? "").matchAll(ATTRIBUTES)) {
      const name = attribute[1]!.toLowerCase();
      const value = decode(attribute[2] ?? attribute[3] ?? "").trim();
      if (name === "srcset") {
        for (const candidate of value.split(",")) {
          const url = candidate.trim().split(/\s+/)[0];
          if (url) references.push({ tag: tag[1]!.toLowerCase(), attribute: name, url });
        }
      } else if (value !== "") {
        references.push({ tag: tag[1]!.toLowerCase(), attribute: name, url: value });
      }
    }
  }
  return references;
}

function htmlFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".html")) found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

/** The URL path of every HTML page under `root`, sorted: `/`, `/404.html`, `/guides/demos/`, `/playground/`. */
export function listPages(root: string): string[] {
  return htmlFiles(root).map((file) => urlPathOf(root, file)).sort();
}

/** `guides/demos/index.html` is served at `/guides/demos/`; `404.html` at `/404.html`. */
function urlPathOf(root: string, file: string): string {
  const relative = file.slice(root.length).split(/[\\/]/).filter(Boolean).join("/");
  return relative === "index.html" ? "/" : relative.endsWith("/index.html") ? `/${relative.slice(0, -"index.html".length)}` : `/${relative}`;
}

/** The file a URL path is served from, or undefined. A directory without a slash is served through Pages' redirect. */
function fileFor(root: string, urlPath: string): string | undefined {
  const relative = decodeURIComponent(urlPath).replace(/^\/+/, "");
  const candidates = relative === "" || relative.endsWith("/") ? [join(root, relative, "index.html")] : [join(root, relative), join(root, relative, "index.html")];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function idsIn(html: string): Set<string> {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) ids.add(decode(match[1] ?? match[2] ?? ""));
  return ids;
}

/** Checks every HTML page under `root` and returns one problem per broken reference, in a stable order. */
export function checkLinks(root: string, options: CheckOptions = {}): LinkProblem[] {
  const problems: LinkProblem[] = [];
  const ids = new Map<string, Set<string>>();
  const idsOf = (file: string): Set<string> => {
    let found = ids.get(file);
    if (found === undefined) ids.set(file, (found = idsIn(readFileSync(file, "utf8"))));
    return found;
  };

  for (const file of htmlFiles(root)) {
    const page = urlPathOf(root, file);
    const seen = new Set<string>();
    for (const { url } of extractReferences(readFileSync(file, "utf8"))) {
      if (seen.has(url)) continue;
      seen.add(url);

      let resolved: URL;
      if (EXTERNAL.test(url)) {
        if (options.origin === undefined || !url.startsWith(`${options.origin}/`) && url !== options.origin) continue;
        resolved = new URL(url);
      } else {
        resolved = new URL(url, `http://site.invalid${page}`);
      }
      const path = resolved.pathname;
      // A query-only or fragment-only reference points at this page.
      const target = url.startsWith("#") || url.startsWith("?") || url === "" ? page : path;
      const served = fileFor(root, target);
      const shown = EXTERNAL.test(url) || url.startsWith("#") ? url : url.startsWith("/") ? url : `${path}${resolved.hash}`;
      if (served === undefined) {
        problems.push({ page, target: shown, reason: "no such file" });
        continue;
      }
      const fragment = decodeURIComponent(resolved.hash.slice(1));
      if (fragment !== "" && served.endsWith(".html") && !idsOf(served).has(fragment)) {
        problems.push({ page, target: shown, reason: `no element with that id in ${urlPathOf(root, served)}` });
      }
    }
  }
  return problems;
}
