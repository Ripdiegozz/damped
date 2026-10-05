import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Astro renders islands on the server. The component tests run inside happy-dom, where `window` exists, so a
// separate process without the test preload is what proves that rendering never touches the DOM.
test("every demo renders in a process that has no window, document or matchMedia", () => {
  const cwd = mkdtempSync(join(tmpdir(), "damped-docs-ssr-"));
  try {
    const script = new URL("./fixtures/ssr-demos.tsx", import.meta.url).pathname;
    const child = Bun.spawnSync([process.execPath, "run", script], { cwd, env: process.env, stdout: "pipe", stderr: "pipe" });
    const stdout = child.stdout.toString();
    expect(child.stderr.toString()).toBe("");
    expect(child.exitCode).toBe(0);
    expect(stdout).toContain("document=undefined window=undefined");
    for (const name of ["retarget-spring", "spring-tuner", "flip-reorder", "morph-card", "presence", "compositor-vs-js"]) {
      expect(stdout).toContain(`rendered ${name}`);
    }
    expect(stdout).toContain("ssr-ok");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 30_000);
