import { resolve, sep } from "node:path";

export interface Mount {
  /** URL prefix, ending in a slash. */
  prefix: string;
  /** Directory the prefix maps to. */
  dir: string;
}

/**
 * Serves a file from the mounts whose prefix matches, in order, until one has it; a path ending in a slash serves
 * its index.html. Mounts may share a prefix, so one directory can fall back to another.
 */
export async function serveStatic(mounts: readonly Mount[], pathname: string): Promise<Response> {
  let status = 404;
  for (const mount of mounts) {
    if (!pathname.startsWith(mount.prefix)) continue;
    const response = await serveFrom(mount, pathname);
    if (response.status === 200) return response;
    if (response.status === 400) status = 400;
  }
  return new Response(status === 400 ? "Bad request" : "Not found", { status });
}

async function serveFrom(mount: Mount, pathname: string): Promise<Response> {
  let relative: string;
  try {
    relative = decodeURIComponent(pathname.slice(mount.prefix.length));
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (relative === "" || relative.endsWith("/")) relative += "index.html";
  const path = resolve(mount.dir, relative);
  // Never serve anything outside the mounted directory.
  if (!path.startsWith(mount.dir + sep)) return new Response("Not found", { status: 404 });

  const file = Bun.file(path);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, { headers: { "cache-control": "no-store" } });
}
