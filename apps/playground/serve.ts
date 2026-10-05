import { join } from "node:path";
import { serveStatic } from "../../e2e/static";

// Local preview of the built site, served at / the way GitHub Pages serves it. Run `bun run playground:build` first.
const dist = join(import.meta.dir, "dist");
const port = Number(process.env.PORT ?? 4180);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: (request) => serveStatic([{ prefix: "/", dir: dist }], new URL(request.url).pathname),
});

console.log(`playground preview on http://127.0.0.1:${port}/`);
