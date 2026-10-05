import { resolve, sep } from "node:path";

export interface Mount {
  /** URL prefix, ending in a slash. */
  prefix: string;
  /** Directory the prefix maps to. */
  dir: string;
}

/** Serves a file from the first mount whose prefix matches; a path ending in a slash serves its index.html. */
export async function serveStatic(mounts: readonly Mount[], pathname: string): Promise<Response> {
  const mount = mounts.find(({ prefix }) => pathname.startsWith(prefix));
  if (mount === undefined) return new Response("Not found", { status: 404 });
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
