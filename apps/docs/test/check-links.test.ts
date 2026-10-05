import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkLinks, extractReferences, listPages } from "../scripts/check-links";

let site: string;
beforeEach(async () => {
  site = await mkdtemp(join(tmpdir(), "damped-links-"));
});
afterEach(() => rm(site, { recursive: true, force: true }));

async function write(files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(site, path)), { recursive: true });
    await writeFile(join(site, path), text);
  }
}

const page = (body: string, head = ""): string => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

test("a site whose links all resolve has no problems", async () => {
  await write({
    "index.html": page('<a href="/guides/demos/">Demos</a> <a href="/guides/demos/#toasts">Toasts</a> <a href="#top">Top</a><h1 id="top">x</h1>', '<link rel="stylesheet" href="/_astro/app.css"><script type="module" src="/_astro/app.js"></script>'),
    "guides/demos/index.html": page('<h2 id="toasts">Toasts</h2><a href="../../">Home</a> <a href="../../playground/">Playground</a><img src="/logo.svg">'),
    "_astro/app.css": "body{}",
    "_astro/app.js": "export {}",
    "logo.svg": "<svg/>",
    "playground/index.html": page('<script type="module" src="main.js"></script><link rel="stylesheet" href="styles.css">'),
    "playground/main.js": "",
    "playground/styles.css": "",
  });
  expect(checkLinks(site)).toEqual([]);
});

test("reports a link to a page that does not exist, with the page it is on", async () => {
  await write({ "index.html": page('<a href="/guides/missing/">Missing</a>'), "guides/demos/index.html": page("") });
  expect(checkLinks(site)).toEqual([{ page: "/", target: "/guides/missing/", reason: "no such file" }]);
});

test("reports missing assets (script, stylesheet, image, island module) and relative links resolved against the page", async () => {
  await write({
    "guides/index.html": page(
      '<img src="logo.svg"><a href="next/">Next</a><astro-island component-url="/_astro/Missing.js" renderer-url="/_astro/client.js"></astro-island>',
      '<link rel="stylesheet" href="/_astro/gone.css"><script src="/_astro/gone.js"></script>',
    ),
    "_astro/client.js": "",
  });
  const targets = checkLinks(site).map((problem) => `${problem.page} -> ${problem.target}`).sort();
  expect(targets).toEqual([
    "/guides/ -> /_astro/Missing.js",
    "/guides/ -> /_astro/gone.css",
    "/guides/ -> /_astro/gone.js",
    "/guides/ -> /guides/logo.svg",
    "/guides/ -> /guides/next/",
  ]);
});

test("checks that the #anchor exists in the target page, and that a bare #anchor exists in the same page", async () => {
  await write({
    "index.html": page('<a href="/guides/demos/#nope">Bad</a><a href="/guides/demos/#toasts">Good</a><a href="#local">Local</a><a href="#absent">Absent</a><h2 id="local">l</h2>'),
    "guides/demos/index.html": page('<h2 id="toasts">Toasts</h2>'),
  });
  expect(checkLinks(site).map((problem) => `${problem.target}: ${problem.reason}`).sort()).toEqual([
    "#absent: no element with that id in /",
    "/guides/demos/#nope: no element with that id in /guides/demos/",
  ]);
});

test("ignores external links, mailto, data URIs and empty hrefs, but follows absolute links to the site's own origin", async () => {
  await write({
    "index.html": page(
      '<a href="https://github.com/x/y">gh</a><a href="mailto:a@b.c">m</a><a href="">e</a><img src="data:image/gif;base64,AAAA"><a href="https://damped.dagadev.net/gone/">own</a><link rel="canonical" href="https://damped.dagadev.net/">',
    ),
  });
  expect(checkLinks(site, { origin: "https://damped.dagadev.net" })).toEqual([{ page: "/", target: "https://damped.dagadev.net/gone/", reason: "no such file" }]);
});

test("does not read links out of escaped code samples", async () => {
  await write({ "index.html": page("<pre>&lt;a href=&quot;/nowhere/&quot;&gt;x&lt;/a&gt;</pre>") });
  expect(checkLinks(site)).toEqual([]);
});

test("a directory link without the trailing slash resolves, as it does on Pages", async () => {
  await write({ "index.html": page('<a href="/guides/demos">Demos</a>'), "guides/demos/index.html": page("") });
  expect(checkLinks(site)).toEqual([]);
});

test("extractReferences lists every checked attribute with the tag it is on", () => {
  const references = extractReferences('<a href="/a/">a</a><img src="/b.png" srcset="/c.png 1x, /d.png 2x"><script src="/e.js"></script>');
  expect(references.map((reference) => reference.url)).toEqual(["/a/", "/b.png", "/c.png", "/d.png", "/e.js"]);
});

test("a canonical link names the page's own identity, not a resource a visitor follows, so it is not checked", async () => {
  await write({ "404.html": page("", '<link rel="canonical" href="https://damped.dagadev.net/404/"><link rel="alternate" href="/gone.xml">') });
  expect(checkLinks(site, { origin: "https://damped.dagadev.net" })).toEqual([{ page: "/404.html", target: "/gone.xml", reason: "no such file" }]);
});

test("listPages names every HTML page by the URL it is served at", async () => {
  await write({ "index.html": page(""), "404.html": page(""), "guides/demos/index.html": page(""), "playground/index.html": page(""), "a.css": "" });
  expect(listPages(site)).toEqual(["/", "/404.html", "/guides/demos/", "/playground/"]);
});
