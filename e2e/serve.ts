import { join, resolve, sep } from "node:path";

// Dev tooling for the Playwright suite: serves e2e/fixtures at / and the built library at /dist.
const root = resolve(import.meta.dir, "..");
const mounts = [
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
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/healthz") return new Response("ok");

    const mount = mounts.find(({ prefix }) => pathname.startsWith(prefix));
    if (mount === undefined) return new Response("Not found", { status: 404 });
    let relative: string;
    try {
      relative = decodeURIComponent(pathname.slice(mount.prefix.length));
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const path = resolve(mount.dir, relative);
    // Never serve anything outside the mounted directory.
    if (!path.startsWith(mount.dir + sep)) return new Response("Not found", { status: 404 });

    const file = Bun.file(path);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "cache-control": "no-store" } });
  },
});

console.log(`e2e server listening on http://127.0.0.1:${port}`);
