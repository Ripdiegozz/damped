import { useSpringValue } from "@damped/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { SPRINGS, prefersReducedMotion } from "./motion";

interface AnimatedNumberProps {
  value: number;
  /** Must be a stable function; it runs on every frame of the count. */
  format(value: number): string;
  className?: string;
}

/**
 * A figure that counts to `value` with a spring. The frames are written to the text node straight from the spring's
 * `onChange`, so React renders when `value` changes and never per frame. A new `value` while it is counting
 * retargets the same spring and keeps its velocity.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const text = useRef<HTMLSpanElement>(null);
  const spring = useSpringValue(0);

  // Subscribed before paint, so the first frame never shows an empty tile.
  useLayoutEffect(() => {
    const node = text.current!;
    node.textContent = format(spring.get());
    return spring.onChange((current) => {
      node.textContent = format(current);
    });
  }, [spring, format]);

  useEffect(() => {
    if (prefersReducedMotion()) spring.jump(value);
    else void spring.set(value, SPRINGS.number);
  }, [spring, value]);

  return <span ref={text} className={className} data-target={value} />;
}
