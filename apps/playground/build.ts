import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

// Dev tooling for the playground: writes a complete static site to dist/, ready to be served at /.
const root = import.meta.dir;
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// `damped` and `@damped/react` resolve to their sources through the paths of the root tsconfig.json, so this build
// never depends on the packages having been built first, and the app holds a single copy of the core.
const result = await Bun.build({
  entrypoints: [join(root, "src/main.tsx")],
  outdir: dist,
  naming: "[name].js",
  target: "browser",
  format: "esm",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  throw new AggregateError(result.logs, "the playground bundle failed to build");
}

await copyFile(join(root, "index.html"), join(dist, "index.html"));
await copyFile(join(root, "src/styles.css"), join(dist, "styles.css"));
// public/ holds the generated tab icons (`bun run brand`); copying the directory means a new asset needs no change here.
await cp(join(root, "public"), dist, { recursive: true });
console.log(`playground built into ${dist}`);
