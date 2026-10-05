// Dev tooling (not published). Unlike @damped/native there are no worklets here, so minifying is safe.
export async function buildReact(outdir: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [new URL("./src/index.ts", import.meta.url).pathname],
    outdir,
    format: "esm",
    target: "browser",
    external: ["react", "react-dom", "react/jsx-runtime", "@damped/core"],
    minify: true,
  });
  if (!result.success) {
    throw new AggregateError(result.logs, "the @damped/react bundle failed to build");
  }
}

if (import.meta.main) {
  await buildReact(new URL("./dist", import.meta.url).pathname);
}
