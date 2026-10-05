export interface IcoImage {
  width: number;
  height: number;
  /** A complete PNG file; ICO has embedded PNG since Windows Vista, and every browser reads it. */
  png: Uint8Array;
}

const HEADER = 6;
const ENTRY = 16;

/** Packs PNG images into one ICO container (ICONDIR, one ICONDIRENTRY per image, then the image data). */
export function encodeIco(images: readonly IcoImage[]): Uint8Array {
  if (images.length === 0) throw new Error("an ICO needs at least one image");
  for (const { width, height } of images) {
    if (width > 256 || height > 256) throw new Error(`an ICO image is at most 256 px, got ${width}x${height}`);
  }

  const out = new Uint8Array(HEADER + ENTRY * images.length + images.reduce((total, image) => total + image.png.length, 0));
  const view = new DataView(out.buffer);
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, images.length, true);

  let offset = HEADER + ENTRY * images.length;
  images.forEach(({ width, height, png }, index) => {
    const entry = HEADER + ENTRY * index;
    view.setUint8(entry, width === 256 ? 0 : width);
    view.setUint8(entry + 1, height === 256 ? 0 : height);
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, png.length, true);
    view.setUint32(entry + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}
