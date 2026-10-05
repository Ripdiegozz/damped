import { join, resolve } from "node:path";
import { serveStatic, type Mount } from "./static";

// Dev tooling for the Playwright suite: serves e2e/fixtures at /, the built library at /dist and the built
// playground at /playground/ (listed first, because the "/" mount matches everything).
const root = resolve(import.meta.dir, "..");
const mounts: Mount[] = [
  { prefix: "/playground/", dir: join(root, "apps/playground/dist") },
  { prefix: "/dist/", dir: join(root, "packages/core/dist") },
  { prefix: "/", dir: join(root, "e2e/fixtures") },
];
// Always provided by the webServer entry of playwright.config.ts, which owns the default.
const port = Number(process.env.E2E_PORT);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error("E2E_PORT must be set to a port number (playwright.config.ts passes it to this server)");
}

Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/healthz") return new Response("ok");
    if (pathname === "/playground") return Response.redirect(new URL("/playground/", request.url), 301);
    return serveStatic(mounts, pathname);
  },
});

console.log(`e2e server listening on http://127.0.0.1:${port}`);
