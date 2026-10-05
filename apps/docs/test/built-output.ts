// Shared by the tests that read the built site (apps/docs/dist). They are real proof, but only exist after
// `bun run docs:build`. Locally a missing build skips them; in CI (CI=true) a missing build is a failure, so
// the suite can never go green by silently not running.

export type BuiltOutputMode = "run" | "skip" | "fail";

export function builtOutputMode(exists: boolean, env: Record<string, string | undefined> = process.env): BuiltOutputMode {
  if (exists) return "run";
  const ci = env.CI;
  return ci !== undefined && ci !== "" && ci !== "false" && ci !== "0" ? "fail" : "skip";
}

/** Plain text of an HTML fragment: tags removed, the few entities Astro and Expressive Code emit decoded. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
