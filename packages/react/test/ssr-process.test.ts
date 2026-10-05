import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The other SSR tests run inside happy-dom, where `document` exists when the module loads. A separate process
// without the test preload is a real server: it exercises the branch that makes the layout effect a no-op.
describe("server rendering without a DOM", () => {
  test("every hook and component renders in a process that has no document or window", () => {
    const cwd = mkdtempSync(join(tmpdir(), "damped-ssr-"));
    try {
      const script = new URL("./fixtures/ssr-child.tsx", import.meta.url).pathname;
      const child = Bun.spawnSync([process.execPath, "run", script], { cwd, env: process.env, stdout: "pipe", stderr: "pipe" });
      const stdout = child.stdout.toString();
      const stderr = child.stderr.toString();

      expect(stderr).toBe("");
      expect(child.exitCode).toBe(0);
      expect(stdout).toContain("document=undefined window=undefined");
      expect(stdout).toContain("layout-effect=noop");
      expect(stdout).toContain("ssr-ok");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
