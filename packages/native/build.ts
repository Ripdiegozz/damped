// Dev tooling (not published). Shared by `bun run build` and the bundle test, so the test
// checks exactly what ships. No minifier: bun strips the "worklet" directives when minifying.
export async function buildNative(outdir: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [new URL("./src/index.ts", import.meta.url).pathname],
    outdir,
    format: "esm",
    target: "browser",
    external: ["react-native-reanimated", "react-native"],
    minify: false,
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "the @damped/native bundle failed to build");
  }
}

if (import.meta.main) {
  await buildNative(new URL("./dist", import.meta.url).pathname);
}
