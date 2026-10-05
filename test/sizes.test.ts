import { describe, expect, test } from "bun:test";
import { formatTable, measure } from "../scripts/sizes-table";

describe("measure", () => {
  test("counts the bytes of the text, not its characters", () => {
    expect(measure("a", "abc").bytes).toBe(3);
    expect(measure("a", "é€").bytes).toBe(5);
  });

  test("reports the gzip size, which is smaller for repetitive text", () => {
    const row = measure("repeat", "abcdefgh".repeat(500));
    expect(row.gzip).toBeGreaterThan(0);
    expect(row.gzip).toBeLessThan(row.bytes / 10);
  });

  test("keeps the name", () => {
    expect(measure("`animate`", "x").name).toBe("`animate`");
  });
});

describe("formatTable", () => {
  const rows = [
    { name: "`animate`", bytes: 7938, gzip: 3466 },
    { name: "full", bytes: 1234567, gzip: 1024 },
  ];

  test("is a markdown table with a header, an alignment row and one line per consumer", () => {
    const lines = formatTable(rows).split("\n");
    expect(lines).toEqual([
      "| Consumer | Bundle | Gzip |",
      "| --- | ---: | ---: |",
      "| `animate` | 7,938 B | 3,466 B (3.38 KB) |",
      "| full | 1,234,567 B | 1,024 B (1.00 KB) |",
    ]);
  });

  test("has only the header for no rows", () => {
    expect(formatTable([]).split("\n")).toHaveLength(2);
  });
});
