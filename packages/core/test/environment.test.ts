import { expect, test } from "bun:test";

test("tests run with a DOM available", () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  expect(document.body.contains(el)).toBe(true);
});
