import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

// Builds everything and assembles the published site: the docs at the root and the Northbook playground under
// /playground/. `bun run site:build` runs it; the Pages workflow uploads `site/`, and the docs e2e serves it.
const repoRoot = resolve(import.meta.dir, "../../..");

export interface SiteParts {
  /** The built docs (apps/docs/dist). */
  docs: string;
  /** The built playground (apps/playground/dist). */
  playground: string;
  /** Where the assembled site goes. It is replaced, never merged into. */
  out: string;
}

/** Copies the two builds into one directory tree. Throws before touching `out` when an input is missing or ambiguous. */
export async function assembleSite({ docs, playground, out }: SiteParts): Promise<void> {
  if (!existsSync(join(docs, "index.html"))) {
    throw new Error(`the built docs are missing (no ${join(docs, "index.html")}); run \`bun run docs:build\` first`);
  }
  if (!existsSync(join(playground, "index.html"))) {
    throw new Error(`the built playground is missing (no ${join(playground, "index.html")}); run \`bun run playground:build\` first`);
  }
  if (existsSync(join(docs, "playground"))) {
    throw new Error("the docs build already has a playground/ entry, which would collide with the Northbook playground");
  }
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(docs, out, { recursive: true });
  await cp(playground, join(out, "playground"), { recursive: true });
}

async function run(...command: string[]): Promise<void> {
  const process = Bun.spawn(command, { cwd: repoRoot, stdout: "inherit", stderr: "inherit" });
  const code = await process.exited;
  if (code !== 0) throw new Error(`\`${command.join(" ")}\` exited with code ${code}`);
}

if (import.meta.main) {
  // The docs resolve the packages through their built dist/, so the packages come first.
  await run("bun", "run", "build");
  await run("bun", "run", "playground:build");
  await run("bun", "run", "docs:build");
  const out = join(repoRoot, "site");
  await assembleSite({ docs: join(repoRoot, "apps/docs/dist"), playground: join(repoRoot, "apps/playground/dist"), out });
  console.log(`site assembled in ${out}`);
}
