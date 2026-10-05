import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
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

export interface TypecheckOptions {
  /** The TypeScript compiler to run. Defaults to the repository's own `node_modules/.bin/tsc`. */
  tsc?: string;
  /** Kills `tsc` and reports a failure after this long. Default 90 s. */
  timeoutMs?: number;
  /** Where `react-native` and its companions are installed. Defaults to the native package's `node_modules`. */
  nativeModules?: string;
}

const DEFAULT_TIMEOUT_MS = 90_000;
const NATIVE_PACKAGES = ["react-native", "react-native-reanimated", "react-native-worklets"] as const;

/**
 * Typechecks all examples with one `tsc` run, each as its own module, against the repository's
 * strict compiler options and the source of the three packages. Returns one message per error.
 * A missing compiler, a hung compiler or a missing native dependency is a message, never a silent pass.
 */
export async function typecheckExamples(examples: readonly Example[], options: TypecheckOptions = {}): Promise<string[]> {
  if (examples.length === 0) return [];

  const tsc = options.tsc ?? join(repoRoot, "node_modules/.bin/tsc");
  if (!(await stat(tsc).then((info) => info.isFile(), () => false))) {
    return [`the TypeScript compiler was not found at ${tsc}; run \`bun install\` in the repository root`];
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

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

    const { config, problems } = await tsconfig(examples, options.nativeModules ?? join(repoRoot, "packages/native/node_modules"));
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify(config));
    const process = Bun.spawn([tsc, "-p", join(directory, "tsconfig.json"), "--pretty", "false"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Killed on the deadline; the race also stops waiting for the pipes, which a killed wrapper's child can hold open.
    const deadline = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        process.kill("SIGKILL");
        resolve("timeout");
      }, timeoutMs);
    });
    const finished = Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
    const result = await Promise.race([finished, deadline]).finally(() => clearTimeout(timer));
    if (result === "timeout") {
      finished.catch(() => undefined);
      return [...problems, `tsc did not finish within ${timeoutMs} ms and was killed`];
    }
    const [output, errors, exitCode] = result;

    // tsc prints paths relative to its working directory; the examples are keyed by absolute path.
    const diagnostics = parseTscOutput(output).map((diagnostic) => ({ ...diagnostic, file: resolve(repoRoot, diagnostic.file) }));
    if (exitCode !== 0 && diagnostics.length === 0) {
      // tsc failed without a diagnostic (bad config, crash): never report that as a pass.
      return [...problems, `tsc exited with code ${exitCode}: ${(output + errors).trim()}`];
    }
    return [...problems, ...mapDiagnostics(diagnostics, byFile)];
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** The native packages an example actually imports, by module name (`react-native/Libraries/...` counts as `react-native`). */
function nativeImports(examples: readonly Example[]): string[] {
  const used = new Set<string>();
  for (const { code } of examples) {
    for (const match of code.matchAll(/\b(?:from|import|require\()\s*["']([^"']+)["']/g)) {
      const name = NATIVE_PACKAGES.find((candidate) => match[1] === candidate || match[1]!.startsWith(`${candidate}/`));
      if (name !== undefined) used.add(name);
    }
  }
  return [...used].sort();
}

async function tsconfig(examples: readonly Example[], nativeModules: string): Promise<{ config: object; problems: string[] }> {
  const source = (name: string): string => join(repoRoot, "packages", name, "src/index.ts");
  // The native examples import react-native and Reanimated directly; their types are installed for the native
  // package only, so they are resolved from there. Only what the examples import is resolved, so a missing or
  // hoisted native install never breaks the other examples.
  const native: Record<string, string[]> = {};
  const problems: string[] = [];
  for (const name of nativeImports(examples)) {
    try {
      native[name] = [await realpath(join(nativeModules, name))];
    } catch {
      problems.push(`an example imports ${name}, but it is not installed at ${join(nativeModules, name)}; run \`bun install\` in the repository root`);
    }
  }
  const config = {
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
  return { config, problems };
}
