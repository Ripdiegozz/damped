import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { extractBlocks, mapDiagnostics, moduleSource, type CodeBlock } from "./readme-examples";

// Dev tooling: type-checks every TypeScript code block of the READMEs against the real sources, so an example that
// does not match the exported signatures fails `bun run docs:check` (and CI). Each block is compiled as its own module.
// Mark a block that is a fragment on purpose with ```ts no-check.
const root = resolve(import.meta.dir, "..");

// Where the blocks of each README are compiled: next to the package, so its dependencies (react, reanimated) resolve.
const READMES: { file: string; workspace: string }[] = [
  { file: "README.md", workspace: "apps/playground" },
  { file: "packages/core/README.md", workspace: "packages/core" },
  { file: "packages/react/README.md", workspace: "packages/react" },
  { file: "packages/native/README.md", workspace: "packages/native" },
];
const SCRATCH = ".readme-check";

const blocks: { block: CodeBlock; path: string }[] = [];
for (const { file, workspace } of READMES) {
  const found = extractBlocks(readFileSync(join(root, file), "utf8"), file);
  found.forEach((block, index) => {
    const slug = file.replace(/[^a-z0-9]+/gi, "-").replace(/-md$/, "");
    blocks.push({ block, path: join(workspace, SCRATCH, `${slug}-${index + 1}.${block.lang}`) });
  });
}

const scratchDirs = [...new Set(READMES.map(({ workspace }) => join(root, workspace, SCRATCH)))];
const cleanup = (): void => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
};

cleanup();
try {
  for (const { block, path } of blocks) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), moduleSource(block.code));
  }
  const child = Bun.spawn([join(root, "node_modules/.bin/tsc"), "-p", "tsconfig.readme.json", "--pretty", "false"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) {
    const lines = mapDiagnostics(stdout + stderr, blocks.map(({ block }) => block), (index) => blocks[index]!.path);
    console.error(lines.join("\n"));
    console.error(`\n${lines.length} problem(s) in the README examples.`);
    process.exitCode = 1;
  } else {
    console.log(`${blocks.length} README examples type-check (${new Set(blocks.map(({ block }) => block.file)).size} files).`);
  }
} finally {
  cleanup();
}
