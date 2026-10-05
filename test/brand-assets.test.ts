import { beforeAll, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildAssets, buildManifest, DRIFT_HINT, findDrift } from "../scripts/brand-assets";

const root = resolve(import.meta.dir, "..");
let assets: Map<string, string | Uint8Array>;
beforeAll(() => {
  assets = buildAssets();
});

function pngSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return [view.getUint32(16), view.getUint32(20)];
}

test("builds exactly the documented set of files", () => {
  expect([...assets.keys()].sort()).toEqual(
    [
      "apps/docs/public/apple-touch-icon.png",
      "apps/docs/public/favicon.ico",
      "apps/docs/public/favicon.svg",
      "apps/docs/public/icon-192.png",
      "apps/docs/public/icon-512.png",
      "apps/docs/public/og.png",
      "apps/docs/public/site.webmanifest",
      "apps/docs/src/assets/lockup-dark.svg",
      "apps/docs/src/assets/lockup-light.svg",
      "apps/docs/src/assets/logo-dark.svg",
      "apps/docs/src/assets/logo-light.svg",
      "apps/playground/public/apple-touch-icon.png",
      "apps/playground/public/favicon.ico",
      "apps/playground/public/favicon.svg",
      "assets/brand/lockup-dark.svg",
      "assets/brand/lockup-light.svg",
      "assets/brand/mark.svg",
      "brand/mark-small.svg",
      "brand/mark.svg",
    ].sort(),
  );
});

test("rasterises the icons at their declared sizes", () => {
  const size = (path: string) => pngSize(assets.get(path) as Uint8Array);
  expect(size("apps/docs/public/apple-touch-icon.png")).toEqual([180, 180]);
  expect(size("apps/docs/public/icon-192.png")).toEqual([192, 192]);
  expect(size("apps/docs/public/icon-512.png")).toEqual([512, 512]);
  expect(size("apps/docs/public/og.png")).toEqual([1200, 630]);
  expect(size("apps/playground/public/apple-touch-icon.png")).toEqual([180, 180]);
});

test("the ico embeds PNGs at 16, 32 and 48 px", () => {
  const ico = assets.get("apps/docs/public/favicon.ico") as Uint8Array;
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
  expect(view.getUint16(4, true)).toBe(3);
  const sizes = [0, 1, 2].map((index) => {
    const offset = view.getUint32(6 + index * 16 + 12, true);
    const length = view.getUint32(6 + index * 16 + 8, true);
    return pngSize(ico.slice(offset, offset + length));
  });
  expect(sizes).toEqual([[16, 16], [32, 32], [48, 48]]);
});

test("the playground gets the same favicons as the docs", () => {
  for (const file of ["favicon.svg", "favicon.ico", "apple-touch-icon.png"]) {
    expect(assets.get(`apps/playground/public/${file}`)).toEqual(assets.get(`apps/docs/public/${file}`));
  }
});

test("the web manifest names the site and lists the icons it ships", () => {
  const manifest = JSON.parse(buildManifest());
  expect(manifest).toMatchObject({ name: "damped", short_name: "damped", display: "browser", theme_color: "#0a0a0b", background_color: "#0a0a0b" });
  expect(manifest.icons).toEqual([
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
  ]);
  expect(assets.get("apps/docs/public/site.webmanifest")).toBe(buildManifest());
  expect(buildManifest().endsWith("\n")).toBe(true);
});

test("building twice gives identical bytes", () => {
  const again = buildAssets();
  expect([...again.keys()]).toEqual([...assets.keys()]);
  for (const [path, bytes] of assets) expect(Buffer.from(again.get(path)!).equals(Buffer.from(bytes))).toBe(true);
});

test("findDrift lists missing and changed files and nothing else", () => {
  const dir = mkdtempSync(join(tmpdir(), "damped-drift-"));
  try {
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "same.svg"), "<svg/>");
    writeFileSync(join(dir, "nested/changed.png"), new Uint8Array([1, 2, 3]));
    const expected = new Map<string, string | Uint8Array>([
      ["same.svg", "<svg/>"],
      ["nested/changed.png", new Uint8Array([1, 2, 4])],
      ["missing.ico", new Uint8Array([9])],
    ]);
    expect(findDrift(expected, dir)).toEqual(["nested/changed.png", "missing.ico"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`the committed files match the generator (${DRIFT_HINT})`, () => {
  const drifted = findDrift(assets, root);
  expect(drifted, `drifted from the generator, ${DRIFT_HINT}:\n${drifted.join("\n")}`).toEqual([]);
});
