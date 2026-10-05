import { useSpringValue } from "@damped/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useMotion } from "./motion-context";

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
  const motion = useMotion();
  // Read when the value changes; moving a slider does not restart a count that is running.
  const latest = useRef(motion);
  latest.current = motion;

  // Subscribed before paint, so the first frame never shows an empty tile.
  useLayoutEffect(() => {
    const node = text.current!;
    node.textContent = format(spring.get());
    return spring.onChange((current) => {
      node.textContent = format(current);
    });
  }, [spring, format]);

  useEffect(() => {
    const { spring: springFor, reduced } = latest.current;
    // A spring value is not an element, so damped cannot apply reducedMotion to it: the count jumps instead.
    const { reducedMotion: _unused, ...counting } = springFor("number");
    if (reduced) spring.jump(value);
    else void spring.set(value, counting);
  }, [spring, value]);

  return <span ref={text} className={className} data-target={value} />;
}
