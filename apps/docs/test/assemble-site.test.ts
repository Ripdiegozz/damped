import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleSite } from "../scripts/assemble-site";

let work: string;
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "damped-site-"));
});
afterEach(() => rm(work, { recursive: true, force: true }));

async function tree(files: Record<string, string>, into: string): Promise<string> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(into, path, ".."), { recursive: true });
    await writeFile(join(into, path), text);
  }
  return into;
}

const docsFiles = { "index.html": "docs home", "_astro/app.js": "docs js", "guides/demos/index.html": "demos" };
const playgroundFiles = { "index.html": "northbook", "main.js": "playground js", "styles.css": "css" };

test("puts the docs at the root and Northbook under /playground/", async () => {
  const docs = await tree(docsFiles, join(work, "docs"));
  const playground = await tree(playgroundFiles, join(work, "playground"));
  const out = join(work, "site");
  await assembleSite({ docs, playground, out });
  expect(await readFile(join(out, "index.html"), "utf8")).toBe("docs home");
  expect(await readFile(join(out, "_astro/app.js"), "utf8")).toBe("docs js");
  expect(await readFile(join(out, "guides/demos/index.html"), "utf8")).toBe("demos");
  expect(await readFile(join(out, "playground/index.html"), "utf8")).toBe("northbook");
  expect(await readFile(join(out, "playground/main.js"), "utf8")).toBe("playground js");
  expect(await readFile(join(out, "playground/styles.css"), "utf8")).toBe("css");
});

test("replaces a previous site instead of merging into it", async () => {
  const docs = await tree(docsFiles, join(work, "docs"));
  const playground = await tree(playgroundFiles, join(work, "playground"));
  const out = await tree({ "stale.html": "old", "playground/old.js": "old" }, join(work, "site"));
  await assembleSite({ docs, playground, out });
  expect(existsSync(join(out, "stale.html"))).toBe(false);
  expect(existsSync(join(out, "playground/old.js"))).toBe(false);
});

test("refuses to assemble from a build that is missing, naming the build to run", async () => {
  const playground = await tree(playgroundFiles, join(work, "playground"));
  await expect(assembleSite({ docs: join(work, "nope"), playground, out: join(work, "site") })).rejects.toThrow(/docs.*docs:build/s);
  const docs = await tree(docsFiles, join(work, "docs"));
  await expect(assembleSite({ docs, playground: join(work, "nope"), out: join(work, "site") })).rejects.toThrow(/playground.*playground:build/s);
  expect(existsSync(join(work, "site"))).toBe(false);
});

test("refuses when the docs already own the /playground/ path", async () => {
  const docs = await tree({ ...docsFiles, "playground/index.html": "a docs page" }, join(work, "docs"));
  const playground = await tree(playgroundFiles, join(work, "playground"));
  await expect(assembleSite({ docs, playground, out: join(work, "site") })).rejects.toThrow(/playground/);
});
