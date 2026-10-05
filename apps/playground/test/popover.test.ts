import { describe, expect, test } from "bun:test";
import { anchorPopover } from "../src/popover";

const button = (right: number, bottom: number) => ({ right, bottom });

describe("anchorPopover", () => {
  test("sits under the button with a gap, right-aligned to it", () => {
    const place = anchorPopover(button(1100, 56), { width: 1280, height: 800 }, { width: 340 });
    expect(place.top).toBe(64);
    expect(place.right).toBe(180);
    expect(place.maxHeight).toBe(800 - 64 - 8);
  });

  test("never leaves the viewport on a narrow screen: the left edge stops at the margin", () => {
    // 420 wide: the panel is 340, so its right offset can be at most 420 - 340 - 8 = 72.
    const place = anchorPopover(button(330, 56), { width: 420, height: 800 }, { width: 340 });
    expect(place.right).toBe(72);
  });

  test("shrinks to the viewport when it is narrower than the panel", () => {
    const place = anchorPopover(button(280, 56), { width: 300, height: 600 }, { width: 340 });
    expect(place.width).toBe(284);
    expect(place.right).toBe(8);
  });

  test("keeps a margin on the right when the button hugs the edge", () => {
    expect(anchorPopover(button(1280, 56), { width: 1280, height: 800 }, { width: 340 }).right).toBe(8);
  });

  test("uses the panel width when there is room", () => {
    expect(anchorPopover(button(1100, 56), { width: 1280, height: 800 }, { width: 340 }).width).toBe(340);
  });

  test("honors a custom gap and margin", () => {
    const place = anchorPopover(button(1100, 56), { width: 1280, height: 800 }, { width: 340, gap: 12, margin: 16 });
    expect(place.top).toBe(68);
    expect(place.maxHeight).toBe(800 - 68 - 16);
  });

  test("never reports a negative height", () => {
    expect(anchorPopover(button(300, 790), { width: 400, height: 800 }, { width: 340 }).maxHeight).toBe(0);
  });
});
