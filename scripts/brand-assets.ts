import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ogSvg } from "../brand/og";
import { lockupSvg, markSvg, tileSvg } from "../brand/svg";
import { palette } from "../brand/tokens";
import { encodeIco } from "./ico";

export type Asset = string | Uint8Array;
export const DRIFT_HINT = "run bun run brand";

const DOCS_PUBLIC = "apps/docs/public";
const DOCS_ASSETS = "apps/docs/src/assets";
const PLAYGROUND_PUBLIC = "apps/playground/public";

/** The cut for a raster size: the small cut only up to 32 px, where the master's thin stroke closes up. */
const cutFor = (size: number) => (size <= 32 ? "small" : "master");

function png(svg: string, width: number): Uint8Array {
  // Text is outlined, so no fonts are loaded and the raster does not depend on the machine.
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().asPng();
}

function tilePng(size: number, radius: number, markSize?: number): Uint8Array {
  return png(tileSvg({ cut: cutFor(size), radius, ...(markSize === undefined ? {} : { size: markSize }) }), size);
}

export function buildManifest(): string {
  const { dark } = palette();
  const icon = (size: number) => ({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png" });
  // Relative URLs resolve against the manifest, so the site works under any base path.
  const manifest = {
    name: "damped",
    short_name: "damped",
    start_url: "./",
    display: "browser",
    theme_color: dark.paper,
    background_color: dark.paper,
    icons: [icon(192), icon(512)],
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Every generated file, keyed by its path relative to the repository root. Pure: nothing is written. */
export function buildAssets(): Map<string, Asset> {
  const assets = new Map<string, Asset>();
  const favicon = tileSvg({ cut: "small" });
  const ico = encodeIco([16, 32, 48].map((size) => ({ width: size, height: size, png: tilePng(size, 7) })));
  const appleTouch = tilePng(180, 0, 20);

  assets.set(`${DOCS_PUBLIC}/favicon.svg`, favicon);
  assets.set(`${DOCS_PUBLIC}/favicon.ico`, ico);
  assets.set(`${DOCS_PUBLIC}/apple-touch-icon.png`, appleTouch);
  assets.set(`${DOCS_PUBLIC}/icon-192.png`, tilePng(192, 7, 22));
  assets.set(`${DOCS_PUBLIC}/icon-512.png`, tilePng(512, 7, 22));
  assets.set(`${DOCS_PUBLIC}/site.webmanifest`, buildManifest());
  assets.set(`${DOCS_PUBLIC}/og.png`, png(ogSvg(), 1200));

  assets.set(`${DOCS_ASSETS}/logo-dark.svg`, markSvg({ cut: "master", ink: palette().dark.ink }));
  assets.set(`${DOCS_ASSETS}/logo-light.svg`, markSvg({ cut: "master", ink: palette().light.ink }));
  assets.set(`${DOCS_ASSETS}/lockup-dark.svg`, lockupSvg("dark"));
  assets.set(`${DOCS_ASSETS}/lockup-light.svg`, lockupSvg("light"));

  assets.set(`${PLAYGROUND_PUBLIC}/favicon.svg`, favicon);
  assets.set(`${PLAYGROUND_PUBLIC}/favicon.ico`, ico);
  assets.set(`${PLAYGROUND_PUBLIC}/apple-touch-icon.png`, appleTouch);

  assets.set("assets/brand/lockup-dark.svg", lockupSvg("dark"));
  assets.set("assets/brand/lockup-light.svg", lockupSvg("light"));
  assets.set("assets/brand/mark.svg", markSvg({ cut: "master", ink: "adaptive" }));

  assets.set("brand/mark.svg", markSvg({ cut: "master", ink: "currentColor" }));
  assets.set("brand/mark-small.svg", markSvg({ cut: "small", ink: "currentColor" }));
  return assets;
}

/** Paths whose committed bytes differ from what the generator produces, or that are missing. */
export function findDrift(assets: ReadonlyMap<string, Asset>, root: string): string[] {
  const toBuffer = (asset: Asset) => (typeof asset === "string" ? Buffer.from(asset) : Buffer.from(asset));
  return [...assets].filter(([path, asset]) => {
    const file = join(root, path);
    return !existsSync(file) || !readFileSync(file).equals(toBuffer(asset));
  }).map(([path]) => path);
}
