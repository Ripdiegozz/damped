import { expect, test } from "bun:test";
import { lockupSvg, markSvg, tileSvg } from "../brand/svg";

const ACCENT = "#ff5f1f";
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("the mark is the spiral in the ink colour and one accent rest dot", () => {
  const svg = markSvg({ cut: "master", ink: "#ededed" });
  expect(svg).toContain('viewBox="0 0 32 32"');
  expect(svg).toContain('<path fill="#ededed" d="M');
  expect(count(svg, ACCENT)).toBe(1);
  expect(svg).toMatch(/<circle [^>]*fill="#ff5f1f"/);
});

test("the plain mark inherits its ink from the page", () => {
  expect(markSvg({ cut: "small", ink: "currentColor" })).toContain('fill="currentColor"');
});

test("the adaptive mark flips its ink with the colour scheme and carries no hard-coded ink on the path", () => {
  const svg = markSvg({ cut: "master", ink: "adaptive" });
  expect(svg).toContain("prefers-color-scheme:dark");
  expect(svg).toContain('class="ink"');
  expect(count(svg, ACCENT)).toBe(1);
});

test("the favicon tile is a near-black rounded square holding the small cut", () => {
  const svg = tileSvg({ cut: "small", radius: 7 });
  expect(svg).toContain('<rect width="32" height="32" rx="7" fill="#0a0a0b"/>');
  expect(svg).toContain('fill="#ededed"');
  expect(count(svg, ACCENT)).toBe(1);
  expect(svg).not.toContain("prefers-color-scheme");
});

test("an icon tile can be a full square with more padding", () => {
  const roomy = tileSvg({ cut: "master", radius: 0, size: 20 });
  expect(roomy).toContain('rx="0"');
  expect(roomy).not.toBe(tileSvg({ cut: "master", radius: 0 }));
});

test("lockups are transparent outlines, light ink on dark and dark ink on light, with the accent on the dot only", () => {
  const dark = lockupSvg("dark");
  const light = lockupSvg("light");
  expect(dark).not.toContain("<rect");
  expect(light).not.toContain("<rect");
  expect(dark).not.toContain("<text");
  expect(dark).toContain('fill="#ededed"');
  expect(dark).not.toContain('fill="#0a0a0b"');
  expect(light).toContain('fill="#0a0a0b"');
  expect(light).not.toContain('fill="#ededed"');
  expect(count(dark, ACCENT)).toBe(1);
  expect(count(light, ACCENT)).toBe(1);
  expect(dark).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
});
