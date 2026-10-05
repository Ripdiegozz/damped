import { transformSync } from "@babel/core";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

export const workletsPlugin = createRequire(import.meta.url).resolve("react-native-worklets/plugin");
const typeStripper = new Bun.Transpiler({ loader: "ts" });

export function workletizeCode(source: string, filename: string): string {
  const result = transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [[workletsPlugin, { disableSourceMaps: true }]],
    parserOpts: { plugins: ["typescript"] },
  });
  if (result?.code == null) throw new Error(`the worklets plugin produced no output for ${filename}`);
  return result.code;
}

export function workletize(path: string, stripTypes = false): string {
  const filename = new URL(path, import.meta.url).pathname;
  const source = readFileSync(filename, "utf8");
  return workletizeCode(stripTypes ? typeStripper.transformSync(source) : source, filename);
}

export const workletNames = (code: string): string[] =>
  [...code.matchAll(/(\w+)\.__workletHash = \d+;/g)].map((match) => match[1] as string).sort();

type Revivable = ((...args: never[]) => unknown) & {
  __initData?: { code: string };
  __closure?: Record<string, unknown>;
};

// Rebuilds a worklet the way the worklets runtime does on the UI thread: from its serialized
// source, with `this.__closure` as the only scope it can see.
export function revive<T>(value: T): T {
  const worklet = value as unknown as Revivable;
  if (typeof worklet !== "function" || worklet.__initData === undefined) return value;
  const closure: Record<string, unknown> = {};
  for (const [name, captured] of Object.entries(worklet.__closure ?? {})) closure[name] = revive(captured);
  const factory = new Function(`return ${worklet.__initData.code}`)() as (...args: unknown[]) => unknown;
  return factory.bind({ __closure: closure }) as unknown as T;
}
