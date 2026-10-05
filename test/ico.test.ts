import { expect, test } from "bun:test";
import { encodeIco } from "../scripts/ico";

const png = (size: number, fill: number) => new Uint8Array(size + 8).fill(fill);

test("writes the ICONDIR header and one 16 byte entry per image", () => {
  const ico = encodeIco([
    { width: 16, height: 16, png: png(10, 1) },
    { width: 32, height: 32, png: png(20, 2) },
  ]);
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);
  expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([0, 1, 2]);

  const entry = (at: number) => {
    const base = 6 + at * 16;
    return {
      width: view.getUint8(base),
      height: view.getUint8(base + 1),
      colors: view.getUint8(base + 2),
      reserved: view.getUint8(base + 3),
      planes: view.getUint16(base + 4, true),
      bits: view.getUint16(base + 6, true),
      size: view.getUint32(base + 8, true),
      offset: view.getUint32(base + 12, true),
    };
  };
  expect(entry(0)).toEqual({ width: 16, height: 16, colors: 0, reserved: 0, planes: 1, bits: 32, size: 18, offset: 38 });
  expect(entry(1)).toEqual({ width: 32, height: 32, colors: 0, reserved: 0, planes: 1, bits: 32, size: 28, offset: 56 });
});

test("embeds each PNG verbatim at its offset", () => {
  const first = png(10, 7);
  const second = png(20, 9);
  const ico = encodeIco([
    { width: 16, height: 16, png: first },
    { width: 48, height: 48, png: second },
  ]);
  expect(ico.length).toBe(6 + 32 + first.length + second.length);
  expect(ico.slice(38, 38 + first.length)).toEqual(first);
  expect(ico.slice(38 + first.length)).toEqual(second);
});

test("stores a 256 px dimension as 0, as the format requires", () => {
  const ico = encodeIco([{ width: 256, height: 256, png: png(4, 1) }]);
  expect([ico[6], ico[7]]).toEqual([0, 0]);
});

test("rejects an empty list and sizes above 256", () => {
  expect(() => encodeIco([])).toThrow("at least one image");
  expect(() => encodeIco([{ width: 512, height: 512, png: png(4, 1) }])).toThrow("256");
});
