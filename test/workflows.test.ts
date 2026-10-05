import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const workflows = join(root, ".github/workflows");

/** Every `uses:` line of a workflow with the ref it pins and the comment that follows it. */
function actionsIn(text: string): { action: string; ref: string; comment: string | undefined }[] {
  return [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)@(\S+?)\s*(?:#\s*(.*))?$/gm)].map((match) => ({
    action: match[1]!,
    ref: match[2]!,
    comment: match[3]?.trim(),
  }));
}

describe("workflows", () => {
  test("every action is pinned to a commit SHA, with the tag it resolves to in a comment", async () => {
    const files = readdirSync(workflows).filter((name) => name.endsWith(".yml"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const used = actionsIn(await Bun.file(join(workflows, file)).text());
      expect(used.length, file).toBeGreaterThan(0);
      for (const { action, ref, comment } of used) {
        expect(ref, `${file}: ${action}`).toMatch(/^[0-9a-f]{40}$/);
        expect(comment, `${file}: ${action}`).toMatch(/^v\d+/);
      }
    }
  });

  test("the same action is pinned to the same commit in every workflow", async () => {
    const pins = new Map<string, Set<string>>();
    for (const file of readdirSync(workflows).filter((name) => name.endsWith(".yml"))) {
      for (const { action, ref } of actionsIn(await Bun.file(join(workflows, file)).text())) {
        pins.set(action, (pins.get(action) ?? new Set()).add(ref));
      }
    }
    for (const [action, refs] of pins) expect(refs.size, action).toBe(1);
  });
});

describe("pages workflow", () => {
  // Read when a test runs, so a missing file fails the tests that need it instead of the whole file.
  const pages = (): string => readFileSync(join(workflows, "pages.yml"), "utf8");

  test("runs on pushes to main and by hand", () => {
    const text = pages();
    expect(text).toMatch(/on:\s*\n\s+push:\s*\n\s+branches:\s*\[main\]\s*\n\s+workflow_dispatch:/);
  });

  test("asks for the permissions Pages needs and nothing more", () => {
    const text = pages();
    expect(text).toMatch(/permissions:\s*\n\s+contents: read\s*\n\s+pages: write\s*\n\s+id-token: write/);
  });

  test("never cancels a deployment that is running", () => {
    const text = pages();
    expect(text).toMatch(/concurrency:\s*\n\s+group: pages\s*\n\s+cancel-in-progress: false/);
  });

  test("builds the packages and the playground, then uploads the playground's dist", () => {
    const text = pages();
    for (const step of ["bun install --frozen-lockfile", "bun run build", "bun run playground:build"]) {
      expect(text, step).toContain(`run: ${step}`);
    }
    expect(text.indexOf("bun run build")).toBeLessThan(text.indexOf("bun run playground:build"));
    expect(text).toMatch(/upload-pages-artifact@[0-9a-f]{40}[^\n]*\n\s+with:\s*\n\s+path: apps\/playground\/dist/);
  });

  test("deploys through the github-pages environment after the build", () => {
    const text = pages();
    expect(text).toMatch(/deploy:[\s\S]*needs: build[\s\S]*environment:\s*\n\s+name: github-pages/);
    expect(text).toContain("actions/deploy-pages@");
  });

  test("uses the same Bun version as CI", async () => {
    const text = pages();
    const ci = Bun.file(join(workflows, "ci.yml"));
    expect(await ci.exists(), ".github/workflows/ci.yml is missing, so there is no Bun version to compare with").toBe(true);
    const match = /bun-version: ([\d.]+)/.exec(await ci.text());
    if (match === null) throw new Error(".github/workflows/ci.yml does not set a numeric `bun-version:`");
    expect(text).toContain(`bun-version: ${match[1]}`);
  });
});

describe("the site served at the domain root", () => {
  test("index.html refers to its assets relatively, so no path prefix is assumed", async () => {
    const html = await Bun.file(join(root, "apps/playground/index.html")).text();
    const references = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((match) => match[1]!);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) expect(reference.startsWith("/") || reference.startsWith("http"), reference).toBe(false);
  });

  test("the playground source never mentions the prefix the e2e server uses", async () => {
    const sources = readdirSync(join(root, "apps/playground/src"));
    for (const name of sources) {
      const text = await Bun.file(join(root, "apps/playground/src", name)).text();
      expect(text, name).not.toContain("/playground/");
    }
  });
});
