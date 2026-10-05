import { describe, expect, test } from "bun:test";
import { builtOutputMode, textOf } from "./built-output";

describe("builtOutputMode", () => {
  test("runs when the build exists, in CI or not", () => {
    expect(builtOutputMode(true, {})).toBe("run");
    expect(builtOutputMode(true, { CI: "true" })).toBe("run");
  });

  test("skips a missing build locally", () => {
    expect(builtOutputMode(false, {})).toBe("skip");
    expect(builtOutputMode(false, { CI: "" })).toBe("skip");
    expect(builtOutputMode(false, { CI: "false" })).toBe("skip");
  });

  test("fails a missing build in CI, so the built-output tests cannot be skipped silently", () => {
    expect(builtOutputMode(false, { CI: "true" })).toBe("fail");
    expect(builtOutputMode(false, { CI: "1" })).toBe("fail");
  });
});

describe("textOf", () => {
  test("drops tags and decodes entities", () => {
    expect(textOf('<span>import { a } from <b>&#x22;x&#x22;</b></span> &amp; &lt;p&gt;')).toBe('import { a } from "x" & <p>');
  });
});
