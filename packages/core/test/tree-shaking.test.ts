import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// A string that only the compositor driver contains (the fill of its Web Animation), so it survives minification
// wherever that code does and is absent wherever it was shaken out.
const COMPOSITOR_MARKER = "forwards";

let dir = "";

// Builds the library the way the package ships it (one minified ES module flagged `sideEffects: false`), then bundles a
// consumer of it with minification, which is what an application using the package does.
async function bundle(consumer: string): Promise<{ text: string; gzip: number }> {
  const entry = join(dir, `consumer-${Math.random().toString(36).slice(2)}.ts`);
  writeFileSync(entry, consumer);
  const result = await Bun.build({ entrypoints: [entry], format: "esm", target: "browser", minify: true });
  expect(result.success, result.logs.join("\n")).toBe(true);
  const text = await result.outputs[0]!.text();
  return { text, gzip: gzipSync(text).length };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "damped-shaking-"));
  mkdirSync(join(dir, "damped"));
  const library = await Bun.build({
    entrypoints: [join(import.meta.dir, "../src/index.ts")],
    outdir: join(dir, "damped"),
    format: "esm",
    target: "browser",
    minify: true,
  });
  expect(library.success, library.logs.join("\n")).toBe(true);
  writeFileSync(join(dir, "damped/package.json"), JSON.stringify({ name: "damped", type: "module", sideEffects: false }));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("tree shaking", () => {
  test("a consumer that only imports animate does not carry the compositor driver", async () => {
    const consumer = await bundle(`import { animate } from "./damped/index.js"; animate(document.body, { x: 1 });`);
    expect(consumer.text).not.toContain(COMPOSITOR_MARKER);
  });

  test("a consumer that imports the compositor driver carries it, and it is the only difference that matters", async () => {
    const plain = await bundle(`import { animate } from "./damped/index.js"; animate(document.body, { x: 1 });`);
    const driven = await bundle(
      `import { animate, compositor } from "./damped/index.js"; animate(document.body, { x: 1 }, { driver: compositor });`,
    );
    expect(driven.text).toContain(COMPOSITOR_MARKER);
    expect(driven.gzip).toBeGreaterThan(plain.gzip);
  });

  test("layout, morph and enter do not pull the compositor driver in either", async () => {
    const consumer = await bundle(
      `import { layout, morph, enter } from "./damped/index.js"; layout(document.body, () => {}); morph(document.body, document.body); enter(document.body, { x: 1 });`,
    );
    expect(consumer.text).not.toContain(COMPOSITOR_MARKER);
  });
});
