import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Same approach as demos-ssr.test.ts: a separate process without the happy-dom preload proves that rendering the
// landing instrument on the server never touches window, document or matchMedia.
test("the spring instrument renders in a process that has no window, document or matchMedia", () => {
  const cwd = mkdtempSync(join(tmpdir(), "damped-instrument-ssr-"));
  try {
    const script = new URL("./fixtures/ssr-instrument.tsx", import.meta.url).pathname;
    const child = Bun.spawnSync([process.execPath, "run", script], { cwd, env: process.env, stdout: "pipe", stderr: "pipe" });
    expect(child.stderr.toString()).toBe("");
    expect(child.exitCode).toBe(0);
    const stdout = child.stdout.toString();
    expect(stdout).toContain("document=undefined window=undefined");
    expect(stdout).toContain("rendered spring-instrument");
    expect(stdout).toContain("ssr-ok");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 30_000);
