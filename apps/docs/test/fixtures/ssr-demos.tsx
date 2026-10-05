// Runs in its own `bun run` process, so happy-dom's test preload never loads: a real server, with no window or
// document. Fails (non-zero exit) on any DOM global, React warning or thrown error.
import { renderToString } from "react-dom/server";
import { DampingRatio, Interruption, MassOnSpring, PhasePortrait } from "../../src/components/physics";
import { CompositorVsJs, FlipReorder, MorphCard, PresenceDemo, RetargetSpring, SpringTuner } from "../../src/components/demos";

const globals = globalThis as Record<string, unknown>;
const warnings: unknown[][] = [];
console.error = (...args) => void warnings.push(args);
console.warn = (...args) => void warnings.push(args);

if (typeof globals.document !== "undefined" || typeof globals.window !== "undefined" || typeof globals.matchMedia !== "undefined") {
  throw new Error("this process must not have a DOM");
}
console.log(`document=${typeof globals.document} window=${typeof globals.window}`);

const demos = {
  "retarget-spring": <RetargetSpring />,
  "spring-tuner": <SpringTuner />,
  "flip-reorder": <FlipReorder />,
  "morph-card": <MorphCard />,
  presence: <PresenceDemo />,
  "compositor-vs-js": <CompositorVsJs />,
  "physics-mass": <MassOnSpring />,
  "physics-damping": <DampingRatio />,
  "physics-phase": <PhasePortrait />,
  "physics-interruption": <Interruption />,
};

for (const [name, element] of Object.entries(demos)) {
  const html = renderToString(element);
  if (!html.includes(`data-demo="${name}"`) || !html.includes('data-state="idle"')) throw new Error(`${name} did not render its test hooks: ${html}`);
  console.log(`rendered ${name}`);
}
if (warnings.length > 0) throw new Error(`React warned: ${JSON.stringify(warnings)}`);
console.log("ssr-ok");
