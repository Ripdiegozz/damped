import { expect, test } from "bun:test";
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
