import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildNative } from "../build";
import * as fake from "./fake-reanimated";
import { revive, workletNames, workletize, workletizeCode } from "./worklets-helpers";

mock.module("react-native-reanimated", () => ({
  defineAnimation: fake.defineAnimation,
  ReduceMotion: fake.ReduceMotion,
}));

const directives = (code: string): number => code.match(/^\s*(["'])worklet\1;?\s*$/gm)?.length ?? 0;

describe("the built bundle keeps its worklets", () => {
  let outdir: string;
  let bundle: string;
  let transformed: string;

  beforeAll(async () => {
    // Inside the package so the bundle resolves react-native-reanimated (mocked above) like a consumer would.
    outdir = await mkdtemp(join(import.meta.dir, "..", "node_modules", ".bundle-test-"));
    await buildNative(outdir);
    bundle = await readFile(join(outdir, "index.js"), "utf8");
    transformed = workletizeCode(bundle, join(outdir, "index.js"));
  });

  afterAll(async () => {
    await rm(outdir, { recursive: true, force: true });
  });

  test("keeps every 'worklet' directive of the sources", async () => {
    const sources = await Promise.all(
      ["../src/math.ts", "../src/index.ts"].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    );
    const expected = sources.reduce((total, source) => total + directives(source), 0);
    expect(expected).toBe(7);
    expect(directives(bundle)).toBe(expected);
  });

  test("workletizes every worklet function of the sources", () => {
    const fromSources = ["../src/math.ts", "../src/index.ts"].flatMap((path) => workletNames(workletize(path)));
    const fromBundle = workletNames(transformed);
    expect(fromBundle).toHaveLength(fromSources.length);
    for (const name of ["assertFinite", "dampedParams", "dampedRestThresholds", "dampedState", "isRest", "withDamped"]) {
      expect(fromBundle).toContain(name);
    }
  });

  test("still imports Reanimated as an external instead of bundling it", () => {
    expect(bundle).toMatch(/from\s*["']react-native-reanimated["']/);
    expect(bundle).not.toContain("react-native-worklets");
  });

  test("withDamped rebuilt from its serialized source animates to the target", async () => {
    const file = join(outdir, "workletized.js");
    await writeFile(file, transformed);
    const module = (await import(file)) as typeof import("../src/index");

    fake.runtime.kind = "ui";
    fake.runtime.systemReduceMotion = false;
    expect((module.withDamped as { __initData?: unknown }).__initData).toBeDefined();
    const withDamped = revive(module.withDamped);
    const sv = new fake.FakeSharedValue(0);
    const calls: unknown[][] = [];
    sv.assign(withDamped(100, { duration: 0.4, bounce: 0.2 }, (...args: unknown[]) => calls.push(args)) as never, 0);
    for (let now = 16; sv.running && now < 10_000; now += 16) sv.frame(now);

    expect(sv.value).toBe(100);
    expect(calls).toEqual([[true]]);
  });
});
