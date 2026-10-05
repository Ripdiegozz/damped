import { afterEach, describe, expect, test } from "bun:test";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionProvider } from "../src/motion-context";
import { ProgressBar } from "../src/ProgressBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function mountBar(progress: number) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const render = (value: number) =>
    act(() =>
      root.render(
        <StrictMode>
          <MotionProvider>
            <ProgressBar progress={value} label="Savings goal" />
          </MotionProvider>
        </StrictMode>,
      ),
    );
  render(progress);
  const fill = container.querySelector<HTMLElement>(".progress-fill")!;
  return { fill, render };
}

/** The horizontal scale damped last wrote, from the inline transform. */
function scaleOf(element: HTMLElement): number {
  const match = /scale\(([\d.e+-]+),/.exec(element.style.transform);
  if (match === null) throw new Error(`no scale in "${element.style.transform}"`);
  return Number(match[1]);
}

async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for the progress fill");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 16));
    });
  }
}

describe("ProgressBar under StrictMode", () => {
  test("the fill grows in from empty on mount", async () => {
    const { fill } = mountBar(0.5);
    // damped writes styles on the frame loop; the first frame must already be near empty, not near the target.
    await until(() => fill.style.transform !== "");
    expect(scaleOf(fill)).toBeLessThan(0.2);
    await until(() => Math.abs(scaleOf(fill) - 0.5) < 0.02);
  });

  test("a later target retargets the fill instead of restarting from empty", async () => {
    const { fill, render } = mountBar(0.5);
    await until(() => fill.style.transform !== "" && Math.abs(scaleOf(fill) - 0.5) < 0.02);
    render(0.9);
    expect(scaleOf(fill)).toBeGreaterThan(0.4);
    await until(() => Math.abs(scaleOf(fill) - 0.9) < 0.02);
  });

  test("reports the value to assistive technology", () => {
    const { fill } = mountBar(0.64);
    expect(fill.closest("[role=progressbar]")?.getAttribute("aria-valuenow")).toBe("64");
  });
});
