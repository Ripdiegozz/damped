import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findExamples, typecheckExamples } from "../scripts/typecheck-examples";

test("the docs contain code examples", async () => {
  expect((await findExamples()).length).toBeGreaterThan(0);
});

test("every ts and tsx example in the docs typechecks against the real packages", async () => {
  const failures = await typecheckExamples(await findExamples());
  expect(failures.join("\n")).toBe("");
}, 120_000);

test("an example that does not typecheck is reported with its document and line", async () => {
  const failures = await typecheckExamples([
    {
      file: "src/content/docs/fake.mdx",
      lang: "ts",
      info: "ts",
      line: 10,
      code: 'import { createSpring } from "@damped/core";\n\nconst spring = createSpring(0, "100");',
    },
    { file: "src/content/docs/fine.mdx", lang: "tsx", info: "tsx", line: 3, code: "const element = <p>ok</p>;" },
  ]);
  expect(failures).toHaveLength(1);
  expect(failures[0]).toMatch(/^src\/content\/docs\/fake\.mdx:13:32 \(code block at line 10\): TS2345 /);
}, 120_000);

const fine = { file: "src/content/docs/fine.mdx", lang: "ts", info: "ts", line: 1, code: "export const a: number = 1;" };

test("a missing native install only fails the examples that import it", async () => {
  const native = {
    file: "src/content/docs/native.mdx",
    lang: "tsx",
    info: "tsx",
    line: 5,
    code: 'import { View } from "react-native";\nexport const x = View;',
  };
  const missing = join(tmpdir(), "damped-docs-no-native-modules");
  const failures = await typecheckExamples([fine], { nativeModules: missing });
  expect(failures).toEqual([]);
  const withNative = await typecheckExamples([fine, native], { nativeModules: missing });
  expect(withNative[0]).toContain("react-native");
  expect(withNative[0]).toContain("bun install");
}, 120_000);

test("a missing compiler is reported with the fix, not thrown", async () => {
  const failures = await typecheckExamples([fine], { tsc: join(tmpdir(), "damped-docs-no-tsc") });
  expect(failures).toHaveLength(1);
  expect(failures[0]).toContain("TypeScript compiler was not found");
  expect(failures[0]).toContain("bun install");
});

test("a compiler that hangs is killed after the timeout and reported", async () => {
  const directory = await mkdtemp(join(tmpdir(), "damped-docs-slow-tsc-"));
  try {
    const slow = join(directory, "tsc");
    await writeFile(slow, "#!/bin/sh\nsleep 30\n");
    await chmod(slow, 0o755);
    const begin = performance.now();
    const failures = await typecheckExamples([fine], { tsc: slow, timeoutMs: 300 });
    expect(performance.now() - begin).toBeLessThan(10_000);
    expect(failures.join("\n")).toContain("did not finish within 300 ms");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
