import { createSpring } from "@damped/core";

/**
 * Placeholder island that proves the workspace packages resolve in the Astro build. The live demos
 * replace it.
 */
export function SpringProbe({ bounce = 0.15, duration = 0.5 }: { bounce?: number; duration?: number }) {
  const spring = createSpring(0, 1, 0, { bounce, duration });
  return (
    <p className="spring-probe">
      A spring with bounce {bounce} and a {duration}s duration settles after{" "}
      <strong>{spring.settleTime().toFixed(2)}s</strong>.
    </p>
  );
}
