import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// What npm and GitHub show about each package: where its docs and sources live, where to report a problem and
// what it is about. The README lockup is checked here too, because it is the repository's face.

const root = resolve(import.meta.dir, "..");
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;

const packages = [
  { dir: "core", reference: "core", keywords: ["spring", "animation", "physics", "interruptible", "velocity", "flip", "layout"] },
  { dir: "react", reference: "react", keywords: ["spring", "animation", "physics", "interruptible", "velocity", "react", "hooks"] },
  { dir: "native", reference: "native", keywords: ["spring", "animation", "physics", "interruptible", "velocity", "react-native", "reanimated", "expo"] },
] as const;

for (const { dir, reference, keywords } of packages) {
  test(`@damped/${dir} points to its docs, repository and issue tracker`, () => {
    const manifest = readJson(`packages/${dir}/package.json`);
    expect(manifest.homepage).toBe(`https://damped.dagadev.net/reference/${reference}/`);
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/Ripdiegozz/damped.git",
      directory: `packages/${dir}`,
    });
    expect(manifest.bugs).toEqual({ url: "https://github.com/Ripdiegozz/damped/issues" });
    expect(manifest.keywords).toEqual(keywords);
  });
}

test("the README shows the lockup in both colour schemes, and the files exist", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  expect(readme).toContain('<source media="(prefers-color-scheme: dark)" srcset="assets/brand/lockup-dark.svg">');
  expect(readme).toMatch(/<img src="assets\/brand\/lockup-light\.svg" alt="damped" width="\d+"/);
  for (const file of ["lockup-dark.svg", "lockup-light.svg"]) {
    const path = join(root, "assets/brand", file);
    expect(existsSync(path), `${file} is missing`).toBe(true);
    expect(readFileSync(path, "utf8").startsWith("<svg")).toBe(true);
  }
});

test("the README keeps an h1 named damped and links to the docs site", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  expect(readme).toMatch(/<h1[^>]*>[\s\S]*?<picture>[\s\S]*?<\/picture>[\s\S]*?<\/h1>/);
  expect(readme).toContain("https://damped.dagadev.net");
});
