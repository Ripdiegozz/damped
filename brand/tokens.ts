import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Reads `--name: #hex;` declarations. Aliases (`var()`), lengths and comments are skipped on purpose. */
export function parseTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [, name, value] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
    const trimmed = value!.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) tokens[name!] = trimmed.toLowerCase();
    else if (/^[\d.]+(px|rem|em)?$/.test(trimmed)) tokens[name!] = trimmed;
  }
  return tokens;
}

function channels(hex: string): [number, number, number] {
  const digits = hex.replace("#", "");
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

export function readTokens(): Record<string, string> {
  return parseTokens(readFileSync(join(import.meta.dir, "tokens.css"), "utf8"));
}

/** The colours the generated assets are drawn with, read from tokens.css so the palette lives in one place. */
export function palette() {
  const tokens = readTokens();
  const get = (name: string) => {
    const value = tokens[name];
    if (value === undefined) throw new Error(`brand/tokens.css has no ${name}`);
    return value;
  };
  return {
    accent: get("--damped-accent"),
    dark: { paper: get("--damped-dark-paper"), ink: get("--damped-dark-ink"), hairline: get("--damped-dark-hairline") },
    light: { paper: get("--damped-light-paper"), ink: get("--damped-light-ink"), hairline: get("--damped-light-hairline") },
  };
}
