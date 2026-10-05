import { describe, expect, test } from "bun:test";
import { transformSync } from "@babel/core";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const workletsPlugin = createRequire(import.meta.url).resolve("react-native-worklets/plugin");
const typeStripper = new Bun.Transpiler({ loader: "ts" });

function workletize(path: string, stripTypes = false): string {
  const filename = new URL(path, import.meta.url).pathname;
  const source = readFileSync(filename, "utf8");
  const result = transformSync(stripTypes ? typeStripper.transformSync(source) : source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [[workletsPlugin, { disableSourceMaps: true }]],
    parserOpts: { plugins: ["typescript"] },
  });
  if (result?.code == null) throw new Error(`the worklets plugin produced no output for ${path}`);
  return result.code;
}

const workletNames = (code: string): string[] =>
  [...code.matchAll(/(\w+)\.__workletHash = \d+;/g)].map((match) => match[1] as string).sort();

type Revivable = ((...args: never[]) => unknown) & {
  __initData?: { code: string };
  __closure?: Record<string, unknown>;
};

// Rebuilds a worklet the way the worklets runtime does on the UI thread: from its serialized
// source, with `this.__closure` as the only scope it can see.
function revive<T>(value: T): T {
  const worklet = value as unknown as Revivable;
  if (typeof worklet !== "function" || worklet.__initData === undefined) return value;
  const closure: Record<string, unknown> = {};
  for (const [name, captured] of Object.entries(worklet.__closure ?? {})) closure[name] = revive(captured);
  const factory = new Function(`return ${worklet.__initData.code}`)() as (...args: unknown[]) => unknown;
  return factory.bind({ __closure: closure }) as unknown as T;
}

describe("worklets babel plugin on math.ts", () => {
  const code = workletize("../src/math.ts");

  test("workletizes every function", () => {
    expect(workletNames(code)).toEqual(
      ["assertFinite", "dampedParams", "dampedRestThresholds", "dampedState", "isRest"].sort(),
    );
    expect(code).toContain("__initData");
  });

  test("imports nothing, so no worklet can capture a non-worklet", () => {
    expect(readFileSync(new URL("../src/math.ts", import.meta.url), "utf8")).not.toMatch(/^\s*import\b/m);
  });

  test("a function without the directive is left alone (negative control)", () => {
    const result = transformSync("export function plain(a) { return a + 1; }", {
      babelrc: false,
      configFile: false,
      filename: "plain.js",
      plugins: [workletsPlugin],
    });
    expect(result?.code).not.toContain("__workletHash");
  });

  test("revived worklets run from their serialized source and match the originals", async () => {
    const original = await import("../src/math");
    const transformed = workletize("../src/math.ts", true);
    const module = (await import(`data:text/javascript;base64,${Buffer.from(transformed).toString("base64")}`)) as typeof original;

    const params = revive(module.dampedParams)({ duration: 0.4, bounce: -0.3 });
    expect(params).toEqual(original.dampedParams({ duration: 0.4, bounce: -0.3 }));
    expect(revive(module.dampedState)(10, 3, params, 0.2)).toEqual(original.dampedState(10, 3, params, 0.2));
    expect(() => revive(module.dampedParams)({ duration: -1 })).toThrow(RangeError);
    // Default parameters must not read module-scope constants: the worklet scope is not set up yet.
    expect(revive(module.isRest)(0.0005, 0.005)).toBe(true);
    expect(revive(module.isRest)(0.002, 0.005)).toBe(false);
    expect(revive(module.dampedRestThresholds)()).toEqual({ restDelta: 0.001, restSpeed: 0.01 });
  });
});

describe("worklets babel plugin on index.ts", () => {
  const code = workletize("../src/index.ts");
  const closureOf = (name: string): string[] => {
    const match = new RegExp(`${name}\\.__closure = \\{([^}]*)\\}`).exec(code);
    return (match?.[1] ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry && !entry.startsWith("_worklet_")).sort();
  };

  test("workletizes withDamped and the animation factory it hands to defineAnimation", () => {
    const names = workletNames(code);
    expect(names).toContain("withDamped");
    expect(names).toHaveLength(2);
  });

  test("withDamped only captures worklets and Reanimated imports", () => {
    expect(closureOf("withDamped")).toEqual(
      ["ReduceMotion", "dampedParams", "dampedRestThresholds", "dampedState", "defineAnimation", "isRest"].sort(),
    );
  });

  test("the animation factory only captures numbers, worklets and the user callback", () => {
    // The plugin names the anonymous factory after the file, e.g. `indexTs1`.
    const factory = workletNames(code).find((name) => name !== "withDamped") as string;
    expect(closureOf(factory)).toEqual(
      ["callback", "dampedState", "isRest", "params", "reduceMotion", "restDelta", "restSpeed", "toValue", "velocity"].sort(),
    );
  });
});
