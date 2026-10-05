import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { mapDiagnostics, parseTscOutput, selectExamples } from "./examples";
import type { Example } from "./examples";

const docsRoot = resolve(import.meta.dir, "..");
const repoRoot = resolve(docsRoot, "../..");
const contentRoot = join(docsRoot, "src/content/docs");

/** Every typechecked code block of every Markdown and MDX page, in a stable order. */
export async function findExamples(): Promise<Example[]> {
  const entries = (await readdir(contentRoot, { recursive: true })).filter((path) => /\.mdx?$/.test(path)).sort();
  const examples: Example[] = [];
  for (const entry of entries) {
    const source = await readFile(join(contentRoot, entry), "utf8");
    examples.push(...selectExamples(source, relative(docsRoot, join(contentRoot, entry))));
  }
  return examples;
}

/**
 * Typechecks all examples with one `tsc` run, each as its own module, against the repository's
 * strict compiler options and the source of the three packages. Returns one message per error.
 */
export async function typecheckExamples(examples: readonly Example[]): Promise<string[]> {
  if (examples.length === 0) return [];

  // Inside apps/docs so that `react` and its types resolve from the docs dependencies.
  const cache = join(docsRoot, "node_modules/.cache");
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "examples-"));
  try {
    const byFile = new Map<string, Example>();
    for (const [index, example] of examples.entries()) {
      const extension = example.lang.toLowerCase() === "tsx" ? "tsx" : "ts";
      const file = join(directory, `example-${String(index).padStart(3, "0")}.${extension}`);
      // The trailing export makes every example a module, so top-level names never collide. It adds
      // no lines before the code, which keeps reported line numbers exact.
      await writeFile(file, `${example.code}\nexport {};\n`);
      byFile.set(file, example);
    }

    await writeFile(join(directory, "tsconfig.json"), JSON.stringify(await tsconfig()));
    const process = Bun.spawn([join(repoRoot, "node_modules/.bin/tsc"), "-p", join(directory, "tsconfig.json"), "--pretty", "false"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [output, errors, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);

    // tsc prints paths relative to its working directory; the examples are keyed by absolute path.
    const diagnostics = parseTscOutput(output).map((diagnostic) => ({ ...diagnostic, file: resolve(repoRoot, diagnostic.file) }));
    if (exitCode !== 0 && diagnostics.length === 0) {
      // tsc failed without a diagnostic (bad config, crash): never report that as a pass.
      return [`tsc exited with code ${exitCode}: ${(output + errors).trim()}`];
    }
    return mapDiagnostics(diagnostics, byFile);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function tsconfig(): Promise<object> {
  const source = (name: string): string => join(repoRoot, "packages", name, "src/index.ts");
  // The native examples import react-native and Reanimated directly; their types are installed
  // for the native package only, so they are resolved from there.
  const nativeModules = join(repoRoot, "packages/native/node_modules");
  const native: Record<string, string[]> = {};
  for (const name of ["react-native", "react-native-reanimated", "react-native-worklets"]) {
    native[name] = [await realpath(join(nativeModules, name))];
  }
  return {
    // The repository's strict options; only the global types and the module mapping differ, since
    // examples must not rely on Bun or Node globals.
    extends: join(repoRoot, "tsconfig.json"),
    compilerOptions: {
      types: [],
      paths: {
        "@damped/core": [source("core")],
        "@damped/react": [source("react")],
        "@damped/native": [source("native")],
        ...native,
      },
    },
    include: ["./*.ts", "./*.tsx"],
    exclude: [],
  };
}
