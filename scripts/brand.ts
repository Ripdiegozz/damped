import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildAssets } from "./brand-assets";

// Dev tooling: writes every derived brand asset from the sources in brand/. The files are committed and
// test/brand-assets.test.ts fails when they drift from this output.
const root = resolve(import.meta.dir, "..");
const assets = buildAssets();
for (const [path, bytes] of assets) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
}
console.log(`wrote ${assets.size} brand assets`);
