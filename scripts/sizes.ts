import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildNative } from "../packages/native/build";
import { buildReact } from "../packages/react/build";
import { formatTable, measure, type Row } from "./sizes-table";

// Dev tooling: measures what an application pays for each part of the library. Every package is built the way it ships
// (@damped/core and @damped/react as minified ES modules flagged `sideEffects: false`), then each consumer is bundled with
// minification, like an application would. Prints a markdown table of bundle and gzip bytes.
const root = resolve(import.meta.dir, "..");
const dir = mkdtempSync(join(tmpdir(), "damped-sizes-"));
const modules = join(dir, "node_modules");

function writePackage(path: string, name: string): void {
  writeFileSync(join(path, "package.json"), JSON.stringify({ name, type: "module", sideEffects: false, main: "index.js" }));
}

async function bundle(name: string, consumer: string, external: string[] = []): Promise<Row> {
  const entry = join(dir, `${name.replace(/\W+/g, "-")}.ts`);
  writeFileSync(entry, consumer);
  const result = await Bun.build({ entrypoints: [entry], format: "esm", target: "browser", minify: true, external });
  if (!result.success) throw new AggregateError(result.logs, `the "${name}" consumer failed to build`);
  return measure(name, await result.outputs[0]!.text());
}

try {
  mkdirSync(join(modules, "@damped/core"), { recursive: true });
  mkdirSync(join(modules, "@damped/react"), { recursive: true });
  mkdirSync(join(dir, "native"), { recursive: true });

  const core = await Bun.build({
    entrypoints: [join(root, "packages/core/src/index.ts")],
    outdir: join(modules, "@damped/core"),
    format: "esm",
    target: "browser",
    minify: true,
  });
  if (!core.success) throw new AggregateError(core.logs, "the @damped/core bundle failed to build");
  writePackage(join(modules, "@damped/core"), "@damped/core");

  await buildReact(join(modules, "@damped/react"));
  writePackage(join(modules, "@damped/react"), "@damped/react");
  await buildNative(join(dir, "native"));

  const el = "document.body";
  const react = ["react", "react-dom", "react/jsx-runtime"];
  const rows: Row[] = [
    await bundle("`animate`", `import { animate } from "@damped/core"; animate(${el}, { x: 1 });`),
    await bundle(
      "`animate` + `compositor`",
      `import { animate, compositor } from "@damped/core"; animate(${el}, { x: 1 }, { driver: compositor });`,
    ),
    await bundle("`layout`", `import { layout } from "@damped/core"; layout(${el}, () => {});`),
    await bundle("`morph`", `import { morph } from "@damped/core"; morph(${el}, ${el});`),
    await bundle("`enter` / `exit`", `import { enter, exit } from "@damped/core"; enter(${el}, { x: 1 }); exit(${el}, { x: 1 });`),
    await bundle("full `@damped/core`", `export * from "@damped/core";`),
    measure("`@damped/react` dist (`@damped/core` and `react` external)", await Bun.file(join(modules, "@damped/react/index.js")).text()),
    await bundle(
      "`useMorph` + `Presence` (`@damped/core` bundled, `react` external)",
      `import { useMorph, Presence } from "@damped/react"; export { useMorph, Presence };`,
      react,
    ),
    measure("`@damped/native` dist (not minified: the worklets plugin needs the directives)", await Bun.file(join(dir, "native/index.js")).text()),
  ];

  console.log(formatTable(rows));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
