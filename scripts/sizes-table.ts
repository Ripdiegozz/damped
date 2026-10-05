import { gzipSync } from "node:zlib";

export interface Row {
  name: string;
  bytes: number;
  gzip: number;
}

/** Bytes of the text as UTF-8, and of its gzip (zlib default level). */
export const measure = (name: string, text: string): Row => ({ name, bytes: Buffer.byteLength(text), gzip: gzipSync(text).length });

const format = new Intl.NumberFormat("en-US");
const kb = (bytes: number): string => `${(bytes / 1024).toFixed(2)} KB`;

/** The rows as a markdown table. */
export function formatTable(rows: readonly Row[]): string {
  return [
    "| Consumer | Bundle | Gzip |",
    "| --- | ---: | ---: |",
    ...rows.map((row) => `| ${row.name} | ${format.format(row.bytes)} B | ${format.format(row.gzip)} B (${kb(row.gzip)}) |`),
  ].join("\n");
}
