import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolve } from "node:path";

const staticModule = resolve(import.meta.dir, "../e2e/static.ts");

/**
 * Runs serveStatic in a child process: the suite preloads happy-dom, whose Response replaces Bun's and cannot
 * read a Bun file body, and a server never runs under it either.
 */
async function serveStatic(mounts: readonly { prefix: string; dir: string }[], pathname: string): Promise<{ status: number; text: () => Promise<string> }> {
  const script = `import { serveStatic } from ${JSON.stringify(staticModule)};
const response = await serveStatic(${JSON.stringify(mounts)}, ${JSON.stringify(pathname)});
console.log(JSON.stringify({ status: response.status, text: await response.text() }));`;
  const child = Bun.spawn([process.execPath, "-e", script], { cwd: tmpdir(), stdout: "pipe", stderr: "pipe" });
  const [output, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  if (code !== 0) throw new Error(await new Response(child.stderr).text());
  const result = JSON.parse(output) as { status: number; text: string };
  return { status: result.status, text: async () => result.text };
}

let first: string;
let second: string;
beforeAll(async () => {
  const base = await mkdtemp(join(tmpdir(), "damped-static-"));
  first = join(base, "first");
  second = join(base, "second");
  await mkdir(join(second, "guides"), { recursive: true });
  await mkdir(first, { recursive: true });
  await writeFile(join(base, "outside.txt"), "secret");
  await writeFile(join(first, "fixture.html"), "fixture");
  await writeFile(join(second, "index.html"), "home");
  await writeFile(join(second, "guides/index.html"), "guides");
});
afterAll(() => rm(join(first, ".."), { recursive: true, force: true }));

const mounts = () => [
  { prefix: "/", dir: first },
  { prefix: "/", dir: second },
];

test("falls through the mounts that share a prefix until one has the file", async () => {
  expect(await serveStatic(mounts(), "/fixture.html").then((response) => response.text())).toBe("fixture");
  expect(await serveStatic(mounts(), "/").then((response) => response.text())).toBe("home");
  expect(await serveStatic(mounts(), "/guides/").then((response) => response.text())).toBe("guides");
});

test("answers 404 when no mount has the file, and never serves outside a mounted directory", async () => {
  expect((await serveStatic(mounts(), "/missing.html")).status).toBe(404);
  expect((await serveStatic(mounts(), "/../outside.txt")).status).toBe(404);
  expect((await serveStatic(mounts(), "/%2e%2e/outside.txt")).status).toBe(404);
});
