// Runs in its own `bun run` process, so happy-dom's test preload never loads. Fails (non-zero exit) on any
// DOM global, React warning or thrown error; prints markers the parent test looks for.
import { useLayoutEffect } from "react";
import { renderToString } from "react-dom/server";
import { Presence, useLayout, useMorph, useSpring, useSpringValue } from "../../src";
import { useIsomorphicLayoutEffect } from "../../src/isomorphic";

const globals = globalThis as Record<string, unknown>;
const warnings: unknown[][] = [];
console.error = (...args) => void warnings.push(args);
console.warn = (...args) => void warnings.push(args);

if (typeof globals.document !== "undefined" || typeof globals.window !== "undefined") {
  throw new Error("this process must not have a DOM");
}
console.log(`document=${typeof globals.document} window=${typeof globals.window}`);
console.log(`layout-effect=${useIsomorphicLayoutEffect === useLayoutEffect ? "react" : "noop"}`);

function Hooks() {
  const value = useSpringValue(1);
  const spring = useSpring<HTMLDivElement>({ x: 10 });
  const layout = useLayout<HTMLDivElement>([1]);
  const { source, target, isOpen } = useMorph();
  return (
    <section>
      <i>{value.get()}</i>
      <div ref={spring} />
      <div ref={layout} />
      <b ref={source}>{String(isOpen)}</b>
      <u ref={target} />
    </section>
  );
}

const html = renderToString(
  <>
    <Hooks />
    <Presence enter={{ opacity: 0 }} exit={{ opacity: 0 }} initial>
      <p key="a">a</p>
    </Presence>
  </>,
);
if (warnings.length > 0) throw new Error(`React warned: ${JSON.stringify(warnings)}`);
if (!html.includes("<section>") || !html.includes("<p>a</p>")) throw new Error(`unexpected html: ${html}`);
console.log("ssr-ok");
