import { describe, expect, test } from "bun:test";
import { initialMorph, morphReducer, type MorphPhase } from "../src/components/demos/morph-machine";

const run = (events: Parameters<typeof morphReducer>[1][], from: MorphPhase = initialMorph): MorphPhase =>
  events.reduce(morphReducer, from);

describe("morph machine", () => {
  test("starts closed", () => {
    expect(initialMorph).toBe("closed");
  });

  test("open goes closed -> opening -> open", () => {
    expect(run(["open"])).toBe("opening");
    expect(run(["open", "settled"])).toBe("open");
  });

  test("close goes open -> closing -> closed", () => {
    expect(run(["open", "settled", "close"])).toBe("closing");
    expect(run(["open", "settled", "close", "settled"])).toBe("closed");
  });

  test("closing while opening reverses the morph at once", () => {
    expect(run(["open", "close"])).toBe("closing");
  });

  test("opening while closing reverses the morph at once", () => {
    expect(run(["open", "settled", "close", "open"])).toBe("opening");
  });

  test("a repeated open or close changes nothing", () => {
    expect(run(["open", "open"])).toBe("opening");
    expect(run(["close"])).toBe("closed");
    expect(run(["open", "settled", "open"])).toBe("open");
    expect(run(["open", "settled", "close", "close"])).toBe("closing");
  });

  test("a settle event that arrives with nothing running is ignored", () => {
    expect(run(["settled"])).toBe("closed");
    expect(run(["open", "settled", "settled"])).toBe("open");
  });

  test("a reversal many times in a row always follows the last request", () => {
    expect(run(["open", "close", "open", "close", "open"])).toBe("opening");
    expect(run(["open", "close", "open", "close", "settled"])).toBe("closed");
  });
});
