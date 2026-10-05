// Runs in its own `bun run` process, so happy-dom's test preload never loads: a real server, with no window or
// document. Fails (non-zero exit) on any DOM global, React warning or thrown error.
import { renderToString } from "react-dom/server";
import { SpringInstrument } from "../../src/components/landing/SpringInstrument";

const globals = globalThis as Record<string, unknown>;
const warnings: unknown[][] = [];
console.error = (...args) => void warnings.push(args);
console.warn = (...args) => void warnings.push(args);

if (typeof globals.document !== "undefined" || typeof globals.window !== "undefined" || typeof globals.matchMedia !== "undefined") {
  throw new Error("this process must not have a DOM");
}
console.log(`document=${typeof globals.document} window=${typeof globals.window}`);

const html = renderToString(<SpringInstrument />);
for (const hook of ['data-demo="spring-instrument"', 'data-state="idle"', 'data-runs="0"', 'role="slider"', 'aria-valuenow="50"']) {
  if (!html.includes(hook)) throw new Error(`the instrument did not render ${hook}: ${html}`);
}
console.log("rendered spring-instrument");
if (warnings.length > 0) throw new Error(`React warned: ${JSON.stringify(warnings)}`);
console.log("ssr-ok");
